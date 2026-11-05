# vibe 번역기

[English](README.md) | **한국어**

ChatGPT 채팅 사용량으로 쓰는 작은 번역기입니다. API 키나 별도 API 요금은 필요 없습니다. 쓰고 있는 ChatGPT 요금제의 한도는 그대로 적용됩니다.

![원문을 선택하면 번역문의 대응 표현이 강조됩니다](docs/images/vibe-translator-usage.png)

## 설치

- [macOS — Apple Silicon](https://github.com/jsal-afk/vibe-translator/releases/download/v1.3.0/vibe-translator-1.3.0-macos-arm64.dmg) · macOS 13 이상
- [Windows — x64](https://github.com/jsal-afk/vibe-translator/releases/download/v1.3.0/vibe-translator-1.3.0-windows-x64-setup.exe) · Windows 10/11

Mac에서는 DMG를 열고 앱을 응용 프로그램 폴더로 옮기면 됩니다. Windows에서는 설치 파일을 실행하세요.

Mac 공증과 Windows 배포 서명은 되어 있지 않아 처음 실행할 때 보안 경고가 뜰 수 있습니다. Windows 빌드는 아직 Windows 실기기에서 확인하지 못했습니다.

## 번역

앱을 열고 필요할 때 ChatGPT에 로그인한 뒤, 번역할 글을 붙여 넣으세요. Enter로 번역하고 Shift+Enter로 줄을 바꿉니다.

번역 대상에는 언어 이름을 넣어도 되고, `고객에게 보내는 일본어 메일`처럼 적어도 됩니다. `kor`만 입력하고 Enter를 누르면 Korean이 선택됩니다. 문체도 `짧고 편하게`, `정중하되 딱딱하지 않게`처럼 적어 주세요.

번역문이 먼저 나오고, 문장과 단어 연결이 뒤따릅니다. 표현을 선택하면 반대쪽의 대응 표현이 강조됩니다. 기다리는 중에도 원문을 고치거나 지울 수 있습니다.

## 언어

자동 모드는 시스템 언어를 따릅니다. 한국어 시스템이라면 한국어는 영어로, 다른 언어는 한국어로 번역합니다. 영어가 아닌 다른 시스템 언어도 같은 방식입니다. 영어 시스템에서는 다른 언어를 영어로 번역하고, 영어이거나 언어가 불분명한 글은 번역 대상을 물어봅니다.

화면 언어는 한국어, 영어, 중국어 간체, 일본어, 스페인어, 프랑스어, 독일어, 중국어 번체 중에서 고를 수 있습니다. 설정에서 바꿀 수 있고 번역 대상과는 별개입니다.

## 소스에서 실행

Node.js 22.12 이상이 필요합니다.

```sh
npm ci
npm start
```

ChatGPT 웹 화면을 사용하는 방식이라 사이트가 바뀌면 연결이 끊길 수 있습니다.

## 크레딧

[miuuyy/codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)을 바탕으로 만들었습니다. [MIT 라이선스](LICENSE). 외부 코드의 고지는 [vendor](vendor/)에 있습니다.
