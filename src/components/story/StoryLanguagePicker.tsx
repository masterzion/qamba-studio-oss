import React from "react";
export default function StoryLanguagePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        list="story-language-tags"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="lv, en, de-DE…"
      />
      <datalist id="story-language-tags">
        {[
          "lv",
          "en",
          "de",
          "fr",
          "es",
          "ru",
          "uk",
          "et",
          "lt",
          "pl",
          "en-GB",
          "en-US",
        ].map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </label>
  );
}
