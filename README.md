# vibe 번역기

ChatGPT 웹 계정으로 사용하는 간단한 데스크톱 번역기입니다. 번역 대상을 **“고객에게 보내는 정중한 일본어”**처럼 자연어로 설명하고, **자연어로 문체를 지정하세요**. 캐시되지 않은 번역은 ChatGPT 웹에 두 번 요청합니다. 첫 응답의 전체 번역을 바로 표시하고, 두 번째 요청으로 원문과 번역문의 대응 구간을 연결합니다. 표현을 선택하면 대응 구간이 함께 강조됩니다.

![vibe 번역기에서 번역문과 대응 구간을 확인하는 모습](docs/images/vibe-translator-usage.png)

이 앱은 OpenAI API를 호출하지 않으므로 API 키와 API 사용 요금이 없습니다. 번역 요청은 로그인한 ChatGPT 웹 계정으로 전송되며 ChatGPT의 사용 한도와 요금제가 적용됩니다. 비공식 웹 UI 자동화 방식이므로 ChatGPT의 화면이나 로그인 절차가 바뀌면 연결이 중단될 수 있습니다. 사용량 한도를 우회하지 않습니다.

## 다운로드 · 1.3.0

 - [macOS · Apple Silicon (arm64)](https://github.com/jsal-afk/vibe-translator/releases/download/v1.3.0/vibe-translator-1.3.0-macos-arm64.dmg) — macOS 13 이상
 - [Windows · x64](https://github.com/jsal-afk/vibe-translator/releases/download/v1.3.0/vibe-translator-1.3.0-windows-x64-setup.exe) — Windows 10/11 64비트

macOS에서 DMG를 열고 `vibe 번역기.app`을 Applications로 복사해 실행하세요. Windows에서는 Setup을 실행해 사용자 계정에 설치하세요. macOS 앱은 로컬 ad-hoc 서명만 적용되며 공증되지 않아 처음 열 때 보안 경고가 표시될 수 있습니다. Windows에서도 게시자를 확인할 수 없다는 경고가 표시될 수 있습니다. Intel Mac 빌드는 제공하지 않습니다.

기존 Baro Translate 사용자는 새 앱을 설치하거나 실행하기 전에 기존 앱을 정상 종료하세요. 같은 로그인 프로필과 단일 실행 잠금을 보존하므로 두 앱을 동시에 실행하지 마세요. 기존 휴대용 복사본을 삭제할 필요는 없습니다.

## 빠른 시작

1. 앱을 열면 ChatGPT 웹에 자동으로 연결하고, 로그인이나 보안 확인이 필요하면 앱이 해당 ChatGPT 창을 앞으로 가져옵니다. 로그인 또는 사람 확인을 직접 마친 뒤 번역기로 돌아오세요. 임베디드 브라우저에서는 보안 확인이 실패하거나 반복될 수 있으니, 그럴 때는 계속 누르거나 새로 고침하지 마세요.
2. 번역 대상을 언어 이름이나 자연어로 입력합니다. 예: `polite Japanese for a hotel guest`.
3. 필요하면 톤 프리셋을 고르거나 자연어로 문체를 지정하고 원문을 입력한 뒤 **번역**을 누릅니다. **Enter**로 번역하고 **Shift+Enter**로 줄을 바꿉니다.
4. 캐시되지 않은 번역은 웹 요청 두 번을 사용합니다. 첫 번째 응답의 전체 번역문이 먼저 나타나고, 두 번째 요청이 문장·단어 대응을 연결합니다. 대응 작업을 취소하거나 실패해도 번역문은 남습니다. 원문을 편집하거나 지우면 현재 작업이 즉시 취소됩니다.
5. 원문이나 번역문에서 표현을 선택해 대응 구간을 확인하고, 결과를 복사하거나 양쪽 텍스트를 바꿀 수 있습니다.

앱 UI는 한국어, English, 简体中文, 日本語, Español, Français, Deutsch, 繁體中文을 지원합니다. UI 언어와 번역 대상은 서로 독립적입니다.
자동 대상은 앱 UI 언어와 별개로 운영체제 언어를 기준으로 합니다. 영어가 아닌 운영체제 언어가 L이면 L로 된 원문은 영어로, 다른 언어 원문은 L로 번역합니다. 영어 운영체제에서는 비영어 원문은 영어로 번역하고, 영어 또는 언어가 불분명한 원문은 전송 전에 번역 대상을 묻습니다. `kor`를 입력하고 Enter를 누르면 Korean 대상으로 처리하며, 다른 자연어 대상 설명은 그대로 보존합니다.

## English

**vibe 번역기** is a simple desktop translator that uses your signed-in ChatGPT web session—not the OpenAI API. It needs no API key and makes no API-usage charges; your ChatGPT web plan and usage limits still apply. Describe a target such as “polite Japanese for a hotel guest,” specify a tone in natural language, and select text to highlight its corresponding phrase. An uncached translation uses two ChatGPT web requests: the first returns the full text immediately, and the second links source and translated phrases. If linking is cancelled or fails, the translation remains; editing or clearing the source immediately cancels the current stage. This is unofficial ChatGPT web UI automation and may stop working when that interface or sign-in flow changes. It does not bypass usage limits.

Downloads: [macOS Apple Silicon, macOS 13+](https://github.com/jsal-afk/vibe-translator/releases/download/v1.3.0/vibe-translator-1.3.0-macos-arm64.dmg) · [Windows x64, Windows 10/11](https://github.com/jsal-afk/vibe-translator/releases/download/v1.3.0/vibe-translator-1.3.0-windows-x64-setup.exe). Open the DMG and copy `vibe 번역기.app` to Applications; run the Windows Setup installer for the current user. macOS is ad-hoc signed but not notarized, so it may show a security warning. Windows may show an unknown-publisher warning. No Intel Mac build is provided.

Users upgrading from Baro Translate should quit the existing app before installing or launching this release. It intentionally reuses the existing login profile and single-instance lock; do not run both apps at once. The old portable copy can remain on disk.

Automatic targeting is independent of the UI language and follows the operating system language. If that language is a non-English language L, text in L is translated into English and other source languages into L. On an English-language system, non-English text defaults to English; English or ambiguous input prompts for a target before sending. Enter `kor` and press Enter to choose Korean; other free-form target descriptions are preserved. The app automatically connects to ChatGPT Web and brings its login or security-check window forward when needed; after signing in or completing the human check, return to the translator.
If ChatGPT asks for a human check, complete it manually in the app-opened window. Embedded-browser security checks may fail or repeat; if they do, stop rather than clicking again or reloading.

MIT licensed. Third-party notices and licenses are retained under [`vendor/`](vendor/).
