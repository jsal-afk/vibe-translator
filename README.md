# vibe Translator

**English** | [한국어](README.ko.md)

A small, free, unlimited translator that uses your ChatGPT CHAT allowance. No agentic useage limits. No API key or separate API bill.

![Message to a friend tone with a slang instruction and linked highlights](docs/images/vibe-translator-usage-en.png)

## Install

- [macOS — Apple Silicon](https://github.com/jsal-afk/vibe-translator/releases/download/v1.3.0/vibe-translator-1.3.0-macos-arm64.dmg) · macOS 13+
- [Windows — x64](https://github.com/jsal-afk/vibe-translator/releases/download/v1.3.0/vibe-translator-1.3.0-windows-x64-setup.exe) · Windows 10/11

On Mac, open the DMG and drag the app to Applications. On Windows, run the installer.

The Mac app isn't notarized, and the Windows installer isn't signed, so your OS may show a security warning. The Windows build has not been tested on a Windows machine yet.

## Translate

Open the app, sign in to ChatGPT when asked, and paste some text. Enter translates; Shift+Enter adds a new line.

For example, paste `¿Vienes esta noche? Avísame cuando salgas y te guardo un sitio.`, set the target to `English`, choose `Message to a friend` under Tone, and type `slang` in Situation.

You can also describe a target in plain language. Language names autocomplete, so `kor` and Enter selects Korean.

The translation appears first; sentence and word links follow. Select a phrase to highlight its counterpart. You can edit or clear the original while either step is running.

## Languages

Auto follows your system language. On a Korean system, Korean goes to English and other languages go to Korean. Other non-English system languages work the same way. On an English system, other languages go to English; English or unclear input asks you to choose a target.

The interface is available in Korean, English, Simplified Chinese, Japanese, Spanish, French, German, and Traditional Chinese. Change it in Settings without changing your translation target.

## From source

Node.js 22.12 or later:

```sh
npm ci
npm start
```

The ChatGPT connection uses its web interface, so changes to that site can break it.

## Credits

Built on [miuuyy/codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web). [MIT license](LICENSE); third-party notices are in [vendor](vendor/).
