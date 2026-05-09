这份 `design.md` 旨在为你的 AI 漫剧平台提供一套完整的视觉与交互规范。方案二的核心在于“混沌中孕育秩序”，通过流体动力学与极简主义 UI 的冲突，营造出一种电影级的深邃感。

---

# Design System: Cinematic Generative Void (v1.0)

## 1. 设计哲学 (Design Philosophy)

* **叙事性 (Narrativity)**：背景不仅仅是装饰，它是 AI 创作过程的视觉化（线条、色彩、分镜的涌现）。
* **深邃感 (Atmospheric Depth)**：通过多层级模糊和环境光（Ambient Glow）拉开 Z 轴空间。
* **精密感 (Precision)**：UI 控件保持绝对的物理锐度，与流动的背景形成强烈对比。

---

## 2. 色彩系统 (Color Palette)

### 2.1 核心色值

| 类别 | 变量名 | 色值 (HEX) | 描述 |
| --- | --- | --- | --- |
| **基础底色** | `@bg-void` | `#020205` | 极深暗调，接近黑洞的颜色 |
| **流体主色 A** | `@fluid-indigo` | `#1A1B4B` | 沉稳的藏青，代表算法的逻辑 |
| **流体主色 B** | `@fluid-purple` | `#2D1B4E` | 艺术性的深紫，代表漫剧的幻想 |
| **环境光阴影** | `@glow-tint` | `#6366F1` | 悬浮容器下方的漫反射光，透明度 15%-25% |
| **高亮描边** | `@border-sharp` | `#FFFFFF` | 容器边缘 0.5px 的锐利高光，透明度 40% |

---

## 3. 视觉组件 (Visual Components)

### 3.1 玻璃态容器 (Glassmorphism Card)

* **材质**：`backdrop-filter: blur(60px) saturate(180%)`。
* **填充**：`rgba(15, 15, 20, 0.4)`。
* **边框**：
* 1px 线性渐变（Top-Left 至 Bottom-Right）。
* `linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.1) 100%)`。


* **阴影**：不使用 `box-shadow` 黑影，改用 `drop-shadow(0 0 30px rgba(99, 102, 241, 0.2))`。

### 3.2 交互控件 (Form Elements)

* **输入框 (Input)**：
* 背景：`rgba(255, 255, 255, 0.03)`。
* 动效：Focus 时，底部边框由中心向两侧伸展，伴随极其微弱的 `indigo` 辉光。


* **主按钮 (Primary Button)**：
* 风格：实色填充或强烈渐变。
* 文本：SF Pro Display / Inter, Semibold, Letter Spacing 0.05em。
* 悬停：产生类似“光波扫描”的过度效果。



---

## 4. 字体系统 (Typography)

* **标题 (Display Text)**：`SF Pro Display` 或 `Inter` (Variable Weight)。
* *Weight: 200 (Thin) / 600 (Semibold)*。


* **正文/标注 (Mono Text)**：`JetBrains Mono` 或 `IBM Plex Mono`。
* 用于显示 AI 状态码、版本号等微小细节，增加科技感。



---

## 5. 动态系统 (Motion & Interaction)

### 5.1 背景：算法流体 (Algorithmic Fluid)

* **实现方式**：基于 WebGL / GLSL Shader。
* **逻辑**：使用 **Simplex Noise** 或 **FBM (Fractional Brownian Motion)** 生成。
* **交互**：鼠标坐标作为引力场点，扰动流体方向。当鼠标悬停在登录框区域时，流体速度放慢，减少干扰。

### 5.2 粒子汇聚 (Particle System)

* **特征**：在登录容器边缘散布极细小的发光粒子（大小 0.5px - 1px）。
* **行为**：随鼠标轻微漂浮，营造一种“数字尘埃”落入光束的氛围。

### 5.3 登录转场：溶解坍缩 (The Dissolve)

* **触发条件**：`onLoginSuccess`。
* **过程**：
1. **UI 坍缩**：登录表单向中心收缩并转化为白色高亮线条。
2. **像素溶解**：线条断裂成无数微小像素点。
3. **时空扭曲**：背景流体瞬间加速，向中心汇聚，形成类似“虫洞跳跃”的视觉冲击。
4. **载入首页**：光芒散去，无缝切入主站分镜界面。



---

## 6. 技术实现参考 (Technical Stack)

* **框架**：Next.js + TypeScript。
* **动画库**：Framer Motion (用于 UI 动效) + GSAP (用于复杂序列)。
* **渲染**：`react-three-fiber` 或直接编写自定义 `Canvas` Shader。
* **图标**：Lucide-react (使用 Stroke 宽度为 1.25px 的细线条)。

---

## 7. 页面布局布局参考 (Layout Sketch)

```text
+---------------------------------------+
| [Logo: Modular Icon]         [Language] |
|                                       |
|          +-----------------+          |
|          |    Login Box    |          |
|          | (Glassmorphism) |          |
|          |      [====]     |          |
|          |      [====]     |          |
|          |    [ Submit ]   |          |
|          +-----------------+          |
|                                       |
| [Status: System_Active] [Version: 0.9] |
+---------------------------------------+

```

> **设计说明**：
> 保持界面绝对对称，除登录容器外，其余文本（如状态码、版本号）应尽可能靠近屏幕边缘，以突出“中心虚空”的视觉重心。