# 王者小游戏 - 轻量玩法合集

> 基于王者荣耀IP的手机端H5轻量小游戏集合，点开即玩，碎片时间即时娱乐。

**在线体验**: https://lyingbird.github.io/wz-minigames/

## 游戏列表

| 游戏 | 英雄 | 玩法 | 操作方式 |
|------|------|------|---------|
| 钟馗 · 黄金矿工 | 钟馗 | 经典黄金矿工，钩子摆动抓取英雄 | 单指点击 |
| 兰陵王 · 暗影刺客 | 兰陵王 | 水果忍者式滑屏切割敌方英雄 | 滑屏切割 |
| 貂蝉 · 弹幕舞步 | 貂蝉 | 弹幕躲避生存，密度越高分数倍率越大 | 虚拟摇杆 + 技能按钮 |
| 廉颇 · 正义蹦蹦 | 廉颇 | 微信跳一跳，长按蓄力跳跃平台 | 长按 + 松手 |
| 李白 · 青莲剑歌 | 李白 | 剑气音游，攒4层剑气解锁大招音符 | 多指节拍 |

## 技术栈

- **渲染**: Canvas 2D + 原生 JavaScript (零依赖)
- **屏幕适配**: FIXED_WIDTH 模式 (设计宽度 390px，高度自适应)
- **音频**: Web Audio API 合成 BGM + SFX (无需音频文件)
- **数据存储**: localStorage (排行榜 + 赛季)
- **部署**: 纯静态文件，GitHub Pages / 任意HTTP服务器

## 项目结构

```
├── index.html              # 游戏大厅入口
├── shared/
│   ├── engine.js           # Canvas引擎 (FIXED_WIDTH适配/触控/碰撞/粒子/对象池)
│   ├── heroes.js           # 英雄数据 (官方API + 头像加载 + 缓存)
│   ├── audio.js            # 音频引擎 (6首BGM + 20+音效, 纯Web Audio合成)
│   ├── leaderboard.js      # 排行榜 (localStorage)
│   ├── season.js           # 赛季系统 (主题轮换 + 英雄池)
│   └── styles.css          # 公共UI样式
├── games/
│   ├── hook/index.html     # 钟馗 · 黄金矿工
│   ├── slash/index.html    # 兰陵王 · 暗影刺客
│   ├── dodge/index.html    # 貂蝉 · 弹幕舞步
│   ├── jump/index.html     # 廉颇 · 正义蹦蹦
│   └── rhythm/index.html   # 李白 · 青莲剑歌
└── assets/
    └── music/              # 音游MP3文件 (需自行添加)
```

## 本地开发

```bash
# 克隆项目
git clone https://github.com/lyingbird/wz-minigames.git
cd wz-minigames

# 启动本地服务器 (任选一种)
python -m http.server 8080
# 或
npx serve .

# 浏览器打开
open http://localhost:8080
```

## 屏幕适配方案

采用行业标准的 **FIXED_WIDTH** 模式 (对标 Cocos Creator / Phaser / LayaAir):

- 设计分辨率: 宽度固定 **390px** (iPhone 14 基准)
- 高度随设备比例变化 — 高屏手机看到更多游戏区域
- `ctx.setTransform()` 统一缩放, 游戏代码全部使用设计坐标
- Safe Area 自动适配 (刘海/灵动岛/Home指示条)

## 素材来源

- **英雄头像**: 王者荣耀官方 CDN (`game.gtimg.cn`)
- **英雄列表数据**: 官方 API (`pvp.qq.com/web201605/js/herolist.json`)
- **皮肤立绘**: 官方 CDN (用于大厅卡片背景)
- **BGM/音效**: Web Audio API 纯合成 (零外部文件依赖)

## 音游 MP3 配置

李白·青莲剑歌支持加载外部 MP3 文件以获得最佳体验:

```
assets/music/song1.mp3  → 长安少年行 (Easy)
assets/music/song2.mp3  → 凤求凰 (Normal)
assets/music/song3.mp3  → 永远的长安城 (Hard)
```

MP3 不存在时自动使用合成音乐作为 fallback。

## 如何添加新游戏

1. 在 `games/` 下创建新目录，如 `games/mygame/index.html`
2. 导入共享模块:
   ```js
   import { createCanvas, createGameLoop, ... } from '../../shared/engine.js';
   import { loadHeroList, preloadAvatars, ... } from '../../shared/heroes.js';
   import { initAudio } from '../../shared/audio.js';
   import { addScore, getLeaderboard } from '../../shared/leaderboard.js';
   ```
3. `createCanvas()` 返回 `width=390` 的设计坐标系，直接用固定像素值编写游戏逻辑
4. 在 `index.html` 的 `GAMES` 数组中添加入口

## 共享引擎 API 速览

### engine.js
```js
createCanvas(container)     // → { canvas, ctx, width:390, height, safeTop, safeBottom }
createGameLoop(update, render)  // → { start, stop, pause, resume }
createJoystick({ side, radius, deadzone })  // 虚拟摇杆
createSwipeDetector(canvas)     // 滑屏检测
createTapDetector(canvas)       // 点击检测
createParticleSystem(max)       // 粒子系统
createPool(factory, reset, size) // 对象池
circleCollision(...)            // 碰撞检测
```

### audio.js
```js
const audio = initAudio();
audio.playBGM('lobby');   // 'lobby'|'hook'|'slash'|'dodge'|'rhythm'
audio.stopBGM(1);
audio.playHit(); audio.playScore(); audio.playCombo(level);
audio.playSlash(); audio.playShoot(); audio.playDash();
audio.playExplosion(); audio.playUlt(); audio.playPickup();
audio.playNewRecord(); audio.playMenuTap(); audio.playGraze();
```

## 贡献指南

1. Fork 本项目
2. 创建特性分支: `git checkout -b feature/new-game`
3. 开发并在手机上测试
4. 提交 PR，描述清楚改了什么、为什么改

### 开发原则
- 每个游戏一个独立 HTML 文件，可独立运行
- 所有尺寸使用设计坐标 (390px宽基准)，不乘缩放因子
- 触控优先，桌面端鼠标作为 fallback
- 音频必须在用户交互后初始化 (浏览器策略)

## License

MIT
