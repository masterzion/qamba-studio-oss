use serde::{Deserialize, Serialize};
use tauri_plugin_http::reqwest;
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalProfile {
    pub base_url: String,
    pub model_id: String,
    pub protocol: String,
    pub timeout_ms: u64,
}
pub fn loopback_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|e| e.to_string())?;
    let host = url.host_str().unwrap_or("").trim_matches(['[', ']']);
    let local = host == "localhost" || host.parse::<std::net::IpAddr>().map(|ip| ip.is_loopback()).unwrap_or(false);
    if !local || !["http", "https"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err("Local providers require a loopback HTTP URL without credentials, query or fragment".into());
    }
    Ok(url)
}
#[tauri::command]
pub async fn local_provider_models(base_url: String, protocol: String) -> Result<Vec<String>, String> {
    loopback_url(&base_url)?;
    let suffix = match protocol.as_str() { "openai-compatible" => "/models", "ollama" => "/api/tags", _ => return Err("Unsupported local protocol".into()) };
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).no_proxy().timeout(std::time::Duration::from_secs(10)).build().map_err(|e| e.to_string())?;
    let response = client.get(format!("{}{suffix}", base_url.trim_end_matches('/'))).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Local model list returned {}", response.status())); }
    let data: serde_json::Value = serde_json::from_str(&response.text().await.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let (list, key) = if protocol == "ollama" { ("models", "name") } else { ("data", "id") };
    let rows = data[list].as_array().ok_or("Local server returned an invalid model list")?;
    Ok(rows.iter().filter_map(|row| row[key].as_str().map(String::from)).collect())
}

#[tauri::command]
pub async fn local_provider_chat(profile: LocalProfile, body: serde_json::Value) -> Result<serde_json::Value, String> {
    loopback_url(&profile.base_url)?;
    if profile.model_id.is_empty() || !(1000..=300000).contains(&profile.timeout_ms) { return Err("Invalid local model or timeout".into()); }
    let suffix = match profile.protocol.as_str() { "ollama" => "/api/chat", "openai-compatible" => "/chat/completions", _ => return Err("Unsupported local protocol".into()) };
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).no_proxy().timeout(std::time::Duration::from_millis(profile.timeout_ms)).build().map_err(|e| e.to_string())?;
    let mut body = body;
    body["model"] = profile.model_id.into(); body["stream"] = false.into();
    let response = client.post(format!("{}{suffix}",profile.base_url.trim_end_matches('/'))).header("Content-Type","application/json").body(body.to_string()).send().await.map_err(|e|e.to_string())?;
    if !response.status().is_success() { return Err(format!("Local provider returned {}", response.status())); }
    let text=response.text().await.map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e|e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn openai_model_list_uses_local_models_endpoint() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_read_timeout(Some(std::time::Duration::from_secs(10))).unwrap();
            let mut buffer = [0; 4096];
            let size = socket.read(&mut buffer).unwrap();
            assert!(String::from_utf8_lossy(&buffer[..size]).starts_with("GET /v1/models "));
            let body = r#"{"data":[{"id":"loaded-model"}]}"#;
            write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
        });
        let models = local_provider_models(format!("http://{address}/v1"), "openai-compatible".into()).await.unwrap();
        assert_eq!(models, vec!["loaded-model"]);
        server.join().unwrap();
    }
    #[test] fn local_destinations_are_strict() {
        for good in ["http://127.0.0.1:11434", "http://localhost:1234/v1", "http://[::1]:1234/v1"] {assert!(loopback_url(good).is_ok());}
        for bad in ["http://127.0.0.1.evil.com", "https://example.com", "http://user:password@localhost", "file:///tmp/a", "http://192.168.1.2"] {assert!(loopback_url(bad).is_err());}
    }
}
