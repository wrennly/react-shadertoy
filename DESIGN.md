# react-shadertoy — Design Document

## Overview

ShadertoyのGLSLシェーダーをコピペでReactコンポーネントとして動かすライブラリ。

```tsx
import { Shadertoy } from 'react-shadertoy'

<Shadertoy fragmentShader={`
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
  }
`} />
```

## コンセプト

- **Shadertoyのコードがそのまま動く** — uniform名の変換不要
- **React開発者が3行で使える** — WebGL/Three.jsの知識不要
- **軽量** — 最小限の依存、バンドルサイズを小さく

## Shadertoy 互換 Uniform

Shadertoyが提供する標準uniformをすべてマッピングする:

| Uniform | Type | 内容 |
|---|---|---|
| `iResolution` | `vec3` | ビューポートサイズ (px) |
| `iTime` | `float` | 経過時間 (秒) |
| `iTimeDelta` | `float` | 前フレームからの差分 (秒) |
| `iFrame` | `int` | フレームカウンター |
| `iMouse` | `vec4` | マウス座標 (xy: current, zw: click) |
| `iDate` | `vec4` | 年月日秒 |
| `iSampleRate` | `float` | オーディオサンプルレート |
| `iChannelResolution[4]` | `vec3[]` | テクスチャ解像度 |
| `iChannel0〜3` | `sampler2D` | テクスチャ入力 |

## API 設計

### 基本（パターンA: コピペ）

```tsx
<Shadertoy
  fragmentShader={glslString}    // 必須: Shadertoy GLSL コード
  style={{ width: '100%', height: '400px' }}
/>
```

### オプション Props

```tsx
<Shadertoy
  fragmentShader={glslString}
  
  // テクスチャ
  textures={{
    iChannel0: '/texture.png',       // 画像URL
    iChannel1: videoElement,          // HTMLVideoElement
    iChannel2: canvasElement,         // HTMLCanvasElement
  }}
  
  // 制御
  paused={false}                     // 一時停止
  speed={1.0}                        // 速度倍率
  pixelRatio={window.devicePixelRatio}
  
  // コールバック
  onError={(error) => {}}            // GLSLコンパイルエラー
  onLoad={() => {}}                  // 初期化完了
  
  // スタイル
  className="my-shader"
  style={{ width: '100%', height: '100vh' }}
/>
```

### API連携（パターンB: ID指定 — 将来実装）

```tsx
// ビルド時にShadertoy APIからGLSL取得+キャッシュ
<Shadertoy id="MdX3zr" />
```

※ 月1,500回API制限あり。ビルド時取得+ローカルキャッシュで回避。
※ ライセンス表示機能が必要（CC BY-NC-SA 3.0がデフォルト）。

### Hooks API

```tsx
import { useShadertoy } from 'react-shadertoy'

const { canvasRef, isReady, error, pause, resume, setUniform } = useShadertoy({
  fragmentShader: glslString,
  textures: { iChannel0: '/noise.png' },
})

return <canvas ref={canvasRef} />
```

## レンダリングエンジンの選択

### 案1: 素のWebGL（推奨）
- **メリット**: 依存ゼロ、バンドル最小、インストールが軽い
- **デメリット**: 自前でWebGLコンテキスト管理
- **適合**: Shadertoyはフルスクリーンquad + fragment shaderなのでWebGLで十分

### 案2: Three.js / R3F
- **メリット**: 既にエコシステムが大きい、shabon-fxと共通基盤
- **デメリット**: Three.js (150KB+) が依存に入る、重い
- **適合**: 3Dシーンが不要なのにThree.jsは過剰

### 結論: **素のWebGL**
Shadertoyの描画は「フルスクリーンquad + fragment shader」だけ。
Three.jsのシーングラフ、カメラ、ライトは一切不要。
軽さがこのライブラリの価値の一つ。

## プロジェクト構成

```
react-shadertoy/
├── src/
│   ├── index.ts              # エクスポート
│   ├── Shadertoy.tsx          # メインコンポーネント
│   ├── useShadertoy.ts        # Hooks API
│   ├── renderer.ts            # WebGLレンダラー（uniform mapping, render loop）
│   ├── uniforms.ts            # Shadertoy uniform定義 + 更新ロジック
│   ├── textures.ts            # iChannel テクスチャローダー
│   └── types.ts               # TypeScript型定義
├── tests/
├── examples/
│   └── basic/                 # 最小サンプル（Vite）
├── package.json
├── tsconfig.json
├── vite.config.ts             # ライブラリビルド
├── README.md
├── LICENSE                    # MIT
└── DESIGN.md                  # このファイル
```

## package.json（設計）

```json
{
  "name": "react-shadertoy",
  "description": "Run Shadertoy GLSL shaders in React. Copy-paste and it works.",
  "keywords": [
    "react", "shadertoy", "glsl", "webgl", "shader",
    "fragment-shader", "creative-coding", "generative-art"
  ],
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "dependencies": {}
}
```

**外部依存ゼロ。** React のみ peerDependency。

## バンドルサイズ目標

| | 目標 |
|---|---|
| minified | < 10KB |
| gzipped | < 4KB |

## 実装フェーズ

### Phase 1: MVP
- [ ] フルスクリーンquad WebGLレンダラー
- [ ] Shadertoy標準uniform全マッピング（iResolution, iTime, iMouse等）
- [ ] `<Shadertoy>` コンポーネント
- [ ] `useShadertoy` フック
- [ ] GLSLコンパイルエラーハンドリング
- [ ] npm publish

### Phase 2: テクスチャ
- [ ] iChannel0〜3 テクスチャ対応（画像/動画/canvas）
- [ ] iChannelResolution 自動設定

### Phase 3: 拡張
- [ ] マルチパス（Buffer A〜D → Image）
- [ ] Shadertoy API連携（ID指定 + ビルド時キャッシュ）
- [ ] ライセンス情報表示

### Phase 4: エコシステム
- [ ] Next.js / Vite / Remix テンプレート
- [ ] Storybook integration
- [ ] Shadertoyからのインポートガイド

## 競合との差別化

| | react-shadertoy | shadertoy-react (dead) | react-shaders |
|---|---|---|---|
| メンテ | **アクティブ** | 2021年放棄 | 2023年放棄 |
| 依存 | **ゼロ** | Three.js | 不明 |
| Shadertoy互換 | **全uniform** | 基本のみ | 部分的 |
| テクスチャ | iChannel0〜3 | なし | 不明 |
| マルチパス | Phase 3 | なし | なし |
| TypeScript | **フル対応** | なし | あり |
| バンドル | **< 4KB gz** | 重い | 不明 |

## shabon-fx との関係

```
react-shadertoy  = 汎用ブリッジ（任意のShadertoy GLSL → React）
shabon-fx        = 厳選エフェクト集（手作り、最適化済み、プロダクション品質）
```

将来的に shabon-fx が react-shadertoy を内部で使う構成もあり得るが、
現時点では独立。shabon-fx は Three.js/R3F ベース、react-shadertoy は素のWebGL。

---

*2026-04-02 設計開始*
