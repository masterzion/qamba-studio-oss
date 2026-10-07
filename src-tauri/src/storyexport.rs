use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, io::Read, path::{Path, PathBuf}};
use tauri::AppHandle;

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct ExportSpec { project_id:String, story_id:String, graph_revision:u64, title:String, language:String, entry_node_id:String, engine_version:String, #[serde(default="default_playable")] playable:bool, #[serde(default)] languages:Vec<String>, files:Vec<TextFile>, media:Vec<MediaFile> }
fn default_playable()->bool {true}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct TextFile {path:String,text:String,content_type:String}
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct MediaFile {key:String,content_type:String,expected_sha256:String}
fn canonical(value:&Value)->String {
    match value {
        Value::Object(map) => {let sorted:BTreeMap<_,_>=map.iter().collect();format!("{{{}}}",sorted.iter().map(|(k,v)|format!("{}:{}",serde_json::to_string(k).unwrap(),canonical(v))).collect::<Vec<_>>().join(","))},
        Value::Array(list) => format!("[{}]",list.iter().map(canonical).collect::<Vec<_>>().join(",")),
        _=>serde_json::to_string(value).unwrap(),
    }
}
fn hash_file(path:&Path)->Result<(String,u64),String>{
    let mut file=std::fs::File::open(path).map_err(|e|e.to_string())?;
    let mut hasher=Sha256::new();let mut bytes=0;let mut buffer=[0u8;65536];
    loop{let n=file.read(&mut buffer).map_err(|e|e.to_string())?;if n==0{break;}hasher.update(&buffer[..n]);bytes+=n as u64;}
    Ok((format!("{:x}",hasher.finalize()),bytes))
}
fn replace_media(value:&mut Value,media:&BTreeMap<String,String>)->Result<(),String>{
    match value {
        Value::Object(map)=>{if let Some(key)=map.remove("mediaKey"){let key=key.as_str().ok_or("Invalid media reference")?;map.insert("mediaPath".into(),json!(media.get(key).ok_or("Missing media reference")?));}for v in map.values_mut(){replace_media(v,media)?;}},
        Value::Array(list)=>for v in list{replace_media(v,media)?;},_=>{}
    }Ok(())
}
fn package_at(parent:&Path,media_root:&Path,spec:ExportSpec)->Result<String,String>{
    if !["1.0.0","2.0.0"].contains(&spec.engine_version.as_str())||spec.graph_revision==0||!spec.story_id.chars().all(|c|c.is_ascii_hexdigit()||c=='-')||spec.story_id.len()!=36{return Err("Invalid story identity or runtime".into());}
    let parent=parent.canonicalize().map_err(|e|e.to_string())?;
    let root=media_root.canonicalize().map_err(|e|e.to_string())?;
    let stamp=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
    let stage=parent.join(format!(".chronolatvia-stage-{}-{stamp}",std::process::id()));
    std::fs::create_dir(&stage).map_err(|e|e.to_string())?;
    let result=(||{
        let mut entries:BTreeMap<String,Value>=BTreeMap::new();let mut mapping=BTreeMap::new();
        std::fs::create_dir(stage.join("media")).map_err(|e|e.to_string())?;
        for media in &spec.media {
            let key=Path::new(&media.key);
            if key.is_absolute()||media.key.contains('\\')||key.components().any(|c|!matches!(c,std::path::Component::Normal(_))){return Err("Unsafe source media key".into());}
            let source=root.join(key).canonicalize().map_err(|e|format!("Missing approved media: {e}"))?;
            if !source.starts_with(&root)||!source.is_file(){return Err("Media escaped the project root".into());}
            let (hash,bytes)=hash_file(&source)?;
            if hash!=media.expected_sha256{return Err("Approved media bytes changed; review and approve the current output again".into());}
            let ext=match media.content_type.as_str(){"video/mp4"=>"mp4","video/webm"=>"webm","audio/wav"=>"wav","audio/mpeg"=>"mp3","image/png"=>"png","image/jpeg"=>"jpg","text/vtt"=>"vtt","application/pdf"=>"pdf","text/plain"=>"txt","application/octet-stream"=>"bin",_=>return Err("Unsupported approved media content type".into())};
            let relative=format!("media/{hash}.{ext}");let target=stage.join(&relative);
            if !target.exists(){std::fs::copy(&source,&target).map_err(|e|e.to_string())?;}
            if hash_file(&target)?!=(hash.clone(),bytes){return Err("Media changed during export".into());}
            mapping.insert(media.key.clone(),relative.clone());entries.insert(relative.clone(),json!({"path":relative,"sha256":hash,"bytes":bytes,"contentType":media.content_type}));
        }
        for file in &spec.files {
            let subtitle=file.path.starts_with("subtitles/")&&file.path.split('/').count()==3&&(file.path.ends_with(".vtt")||file.path.ends_with(".srt"));
            if (!subtitle && !["graph.json","scenes.json","historical.json","assets.json","dialogue.json","localization.json","runtime/conformance.json","reports/validation.json"].contains(&file.path.as_str()))||entries.contains_key(&file.path){return Err("Unsafe or duplicate package document".into());}
            let safe=crate::localstore::safe_key(&file.path)?;
            let text=if subtitle {file.text.clone()}else{let mut value:Value=serde_json::from_str(&file.text).map_err(|e|e.to_string())?;replace_media(&mut value,&mapping)?;canonical(&value)};
            let path=stage.join(safe);std::fs::create_dir_all(path.parent().unwrap()).map_err(|e|e.to_string())?;std::fs::write(&path,text).map_err(|e|e.to_string())?;
            let(hash,bytes)=hash_file(&path)?;entries.insert(file.path.clone(),json!({"path":file.path,"sha256":hash,"bytes":bytes,"contentType":file.content_type}));
        }
        for required in ["graph.json","scenes.json","historical.json","runtime/conformance.json","reports/validation.json"]{if !entries.contains_key(required){return Err("Incomplete package documents".into());}}
        for(path,text)in [("runtime/story-runtime.mjs",include_str!("../../director/story_runtime.js")),("runtime/story-player.mjs",include_str!("../../director/story_player.mjs")),("player.html",include_str!("../../director/story_player.html")),("README.txt",include_str!("../../director/story_package_readme.txt")),("LICENSE.txt",include_str!("../../LICENSE"))]{let target=stage.join(path);std::fs::write(&target,if path=="runtime/story-player.mjs" {text.replace("./story_runtime.js","./story-runtime.mjs")}else{text.to_string()}).map_err(|e|e.to_string())?;let(hash,bytes)=hash_file(&target)?;entries.insert(path.into(),json!({"path":path,"sha256":hash,"bytes":bytes,"contentType":"text/plain"}));}
        let mut manifest=json!({"format":"chronolatvia-interactive-story","formatVersion":if spec.engine_version=="2.0.0" {2}else{1},"playable":spec.playable,"languages":if spec.languages.is_empty(){vec![spec.language.clone()]}else{spec.languages},"storyId":spec.story_id,"graphRevision":spec.graph_revision,"engineVersion":spec.engine_version,"entryNodeId":spec.entry_node_id,"language":spec.language,"title":spec.title,"files":entries.values().collect::<Vec<_>>()});
        if spec.engine_version=="1.0.0" {manifest.as_object_mut().unwrap().remove("languages");manifest.as_object_mut().unwrap().remove("playable");}
        let hash=format!("{:x}",Sha256::digest(canonical(&manifest).as_bytes()));manifest["contentHash"]=json!(hash);
        std::fs::write(stage.join("manifest.json"),canonical(&manifest)).map_err(|e|e.to_string())?;
        let destination=parent.join(format!("chronolatvia-{}-{}-{}",spec.story_id,spec.graph_revision,&hash[..12]));
        if destination.exists(){return Err("This package already exists; choose a different output folder".into());}
        std::fs::rename(&stage,&destination).map_err(|e|e.to_string())?;Ok(destination.to_string_lossy().into_owned())
    })();
    if result.is_err(){let _=std::fs::remove_dir_all(&stage);}result
}
#[tauri::command]
pub async fn story_export(app:AppHandle,spec:ExportSpec)->Result<Option<String>,String>{
    use tauri_plugin_dialog::DialogExt;
    let(tx,rx)=tokio::sync::oneshot::channel();app.dialog().file().set_title("Choose the story package output folder").pick_folder(move|picked|{let _=tx.send(picked);});
    let Some(parent)=rx.await.map_err(|e|e.to_string())? else{return Ok(None);};
    let parent:PathBuf=parent.into_path().map_err(|e|e.to_string())?;
    let media_root=crate::localstore::media_root(&app,&spec.project_id)?;
    tauri::async_runtime::spawn_blocking(move||package_at(&parent,&media_root,spec)).await.map_err(|e|e.to_string())?.map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn workspace()->PathBuf {let path=std::env::temp_dir().join(format!("qamba-story-test-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));std::fs::create_dir(&path).unwrap();path}
    fn specification(hash:String,key:&str)->ExportSpec {serde_json::from_value(json!({"projectId":"test","storyId":"10000000-0000-4000-8000-000000000001","graphRevision":1,"title":"Synthetic writer test","language":"lv","entryNodeId":"10000000-0000-4000-8000-000000000001","engineVersion":"1.0.0","files":(["graph.json","scenes.json","historical.json","runtime/conformance.json","reports/validation.json"].iter().map(|p|json!({"path":p,"text":if *p=="scenes.json" {format!("{{\"mediaKey\":{}}}",serde_json::to_string(key).unwrap())}else{"{}".into()},"contentType":"application/json"})).collect::<Vec<_>>()),"media":[{"key":key,"contentType":"video/mp4","expectedSha256":hash}]})).unwrap()}
    #[test] fn writer_checks_review_hash_and_replaces_media_references(){let base=workspace();let media=base.join("source");std::fs::create_dir(&media).unwrap();std::fs::write(media.join("test.mp4"),b"synthetic writer bytes").unwrap();let hash=hash_file(&media.join("test.mp4")).unwrap().0;let output=package_at(&base,&media,specification(hash.clone(),"test.mp4")).unwrap();let manifest:Value=serde_json::from_slice(&std::fs::read(Path::new(&output).join("manifest.json")).unwrap()).unwrap();let scene:Value=serde_json::from_slice(&std::fs::read(Path::new(&output).join("scenes.json")).unwrap()).unwrap();assert_eq!(scene["mediaPath"],format!("media/{hash}.mp4"));for file in manifest["files"].as_array().unwrap(){let measured=hash_file(&Path::new(&output).join(file["path"].as_str().unwrap())).unwrap();assert_eq!(measured.0,file["sha256"].as_str().unwrap());assert_eq!(measured.1,file["bytes"].as_u64().unwrap());}std::fs::write(media.join("test.mp4"),b"changed after review").unwrap();assert!(package_at(&base,&media,specification(hash,"test.mp4")).unwrap_err().contains("changed"));assert!(!std::fs::read_dir(&base).unwrap().any(|e|e.unwrap().file_name().to_string_lossy().starts_with(".chronolatvia-stage")));std::fs::remove_dir_all(base).unwrap();}
    #[test] fn writer_rejects_traversal(){let base=workspace();assert!(package_at(&base,&base,specification("a".repeat(64),"../outside.mp4")).unwrap_err().contains("Unsafe"));std::fs::remove_dir_all(base).unwrap();}
    #[test]
    #[ignore = "Requires explicit FFmpeg synthetic fixture preparation"]
    fn consumer_fixture_package(){let base=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.test-output/story-export");let spec:ExportSpec=serde_json::from_slice(&std::fs::read(base.join("spec.json")).expect("Run node scripts/story-export-fixture.mjs first")).unwrap();let result=package_at(&base,&base.join("media-source"),spec).unwrap();std::fs::write(base.join("package-path.txt"),result).unwrap();}
}

#[tauri::command]
pub async fn story_media_probe(app:AppHandle,project_id:String,key:String)->Result<Value,String>{
    let root=crate::localstore::media_root(&app,&project_id)?.canonicalize().map_err(|e|e.to_string())?;
    let relative=Path::new(&key);
    if relative.is_absolute()||key.contains('\\')||relative.components().any(|c|!matches!(c,std::path::Component::Normal(_))){return Err("Unsafe media key".into());}
    let source=root.join(relative).canonicalize().map_err(|e|e.to_string())?;
    if !source.starts_with(&root)||!source.is_file(){return Err("Media escaped the project root".into());}
    let child_path=crate::engine::child_path(&crate::engine::engine_root(&app));
    tauri::async_runtime::spawn_blocking(move||{
        let(hash,bytes)=hash_file(&source)?;
        let mut cmd=std::process::Command::new("ffprobe");
        cmd.env("PATH",child_path).args(["-v","error","-print_format","json","-show_format","-show_streams"]).arg(&source);
        let output=crate::hardware::no_window(&mut cmd).output().map_err(|e|e.to_string())?;
        if !output.status.success(){if [Some("vtt"),Some("txt")].contains(&source.extension().and_then(|s|s.to_str())){return Ok(json!({"sha256":hash,"bytes":bytes,"hasAudio":false}));}return Err("FFprobe could not verify this media file".into());}
        let probe:Value=serde_json::from_slice(&output.stdout).map_err(|e|e.to_string())?;
        let streams=probe["streams"].as_array().ok_or("Media contains no streams")?;
        let video=streams.iter().find(|s|s["codec_type"]=="video");
        let audio=streams.iter().any(|s|s["codec_type"]=="audio");
        let duration=probe["format"]["duration"].as_str().and_then(|v|v.parse::<f64>().ok()).map(|v|(v*1000.0).round() as u64);
        let fps=video.and_then(|v|v["avg_frame_rate"].as_str()).and_then(|v|v.split_once('/')).and_then(|(n,d)|{let n=n.parse::<f64>().ok()?;let d=d.parse::<f64>().ok()?;if d>0.0{Some(n/d)}else{None}});
        if hash_file(&source)?!=(hash.clone(),bytes){return Err("Media changed during verification".into());}
        Ok(json!({"sha256":hash,"bytes":bytes,"durationMs":duration,"width":video.map(|v|&v["width"]),"height":video.map(|v|&v["height"]),"fps":fps,"hasAudio":audio}))
    }).await.map_err(|e|e.to_string())?
}
