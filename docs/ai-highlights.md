# AI取組見どころ生成

相撲日和は、同じ事実JSON・同じ出力スキーマをGeminiとOpenAIの両方へ渡します。接続先だけを環境設定で切り替え、生成済みの日本語・英語3項目はD1の `bout_highlights` に保存します。一般閲覧用APIは読み取り専用です。

## 接続設定

初期値はGeminiです。

| 設定 | 初期値 | 用途 |
| --- | --- | --- |
| `AI_PROVIDER` | `gemini` | `gemini` または `openai` |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | GeminiのモデルID |
| `OPENAI_MODEL` | `gpt-5.6-luna` | OpenAIのモデルID |
| `GEMINI_API_KEY` | なし | Gemini利用時のサーバー側シークレット |
| `OPENAI_API_KEY` | なし | OpenAI利用時のサーバー側シークレット |
| `AI_HIGHLIGHT_ADMIN_TOKEN` | なし | 生成処理を呼ぶ管理用シークレット |

APIキーと管理用トークンはブラウザ用の環境変数やソースコードへ入れず、ホスティング側のシークレットとして登録します。

OpenAIへ切り替える場合は `AI_PROVIDER=openai` に変更します。DB形式、画面、固定プロンプト、JSON Schemaは変わりません。

## 生成対象

- 幕内：その日の全取組
- 十両：その日の全取組
- 幕下：東西どちらかの高い番付を基準にした上位5番

中央の公式取組キャッシュを読み、予測・体格・当日成績・直接対戦を事実JSONへまとめます。現在の初版では、DBに存在しない連勝情報や昇進条件をモデルへ推測させません。

## 安全な生成

生成は `POST /api/admin/generate-highlights` だけが行い、`Authorization: Bearer <AI_HIGHLIGHT_ADMIN_TOKEN>` が必要です。同じ事実・同じプロンプト・同じモデルの結果は再利用されます。`GET /api/highlights` は保存済み結果を返すだけで、書き込みません。

Geminiの無料枠は入力データの取り扱い条件が有料枠と異なるため、個人情報や秘密情報を事実JSONへ入れません。本機能が扱うのは公開済みの相撲成績・番付・体格・レートです。
