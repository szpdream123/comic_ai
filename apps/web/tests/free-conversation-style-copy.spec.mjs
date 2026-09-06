import assert from "node:assert/strict";
import test from "node:test";
import { createCanvasAgentController, renderCanvasAgentPanel } from "../src/features/new-canvas/canvas-agent-panel.js";

test("new conversations default to catalog CG animation without overriding an explicit style", async () => {
  const styles = [
    { id: "catalog-cg", name: "CG 动画", prompt_content: "CG动画质感" },
    { id: "catalog-anime", name: "二次元", prompt_content: "二次元线稿" },
  ];
  const ui = { canvasAgentCapabilityProfile: "media_generation_only", canvasAgent: {} };
  const controller = createCanvasAgentController({ surface: { querySelector: () => null }, workbench: { ui, api: { async getProjectStyles() { return { styles }; } } } });
  try {
    await controller.resume();
    renderCanvasAgentPanel(ui);
    assert.equal(ui.canvasAgent.visualStyleId, "catalog-cg");
    assert.match(renderCanvasAgentPanel(ui), /<select data-agent-field="visualStyleId"/);
    controller.handleInput({ dataset: { agentField: "visualStyleId" }, value: "catalog-anime" });
    renderCanvasAgentPanel(ui);
    assert.equal(ui.canvasAgent.visualStyleId, "catalog-anime");
    ui.canvasAgent.visualStylePending = false;
    ui.canvasAgent.messages = [{ role: "user", text: "请生成真人写实风格的人物" }];
    renderCanvasAgentPanel(ui);
    assert.equal(ui.canvasAgent.visualStyleId, "realistic");
  } finally { controller.dispose(); }
});

test("compact composer settings and mode menus preserve the draft and selected style", async () => {
  const ui={canvasAgentCapabilityProfile:"media_generation_only",canvasAgent:{promptDraft:"雨后的校园",projectVisualStyles:[{id:"oil",label:"油画",instruction:"油画笔触"}]}};
  const controller=createCanvasAgentController({surface:{querySelector:()=>null},workbench:{ui}});
  try {
    assert.match(renderCanvasAgentPanel(ui),/canvas-agent-customize-panel"[^>]*hidden/);
    await controller.handleAction({dataset:{agentAction:"toggle-composer-settings"}});
    assert.equal(ui.canvasAgent.composerSettingsOpen,true);
    controller.handleInput({dataset:{agentField:"visualStyleId"},value:"oil"});
    assert.equal(ui.canvasAgent.composerSettingsOpen,true);
    controller.handleKeydown({key:"Escape",preventDefault(){}},{});
    assert.equal(ui.canvasAgent.composerSettingsOpen,false);
    await controller.handleAction({dataset:{agentAction:"toggle-free-generation-menu",field:"kind"}});
    assert.equal(ui.canvasAgent.generationMenuOpen,"free-generation:kind");
    await controller.handleAction({dataset:{agentAction:"select-free-generation-kind",value:"video"}});
    assert.equal(ui.canvasAgent.generationKind,"video");
    assert.equal(ui.canvasAgent.generationMenuOpen,"");
    assert.equal(ui.canvasAgent.promptDraft,"雨后的校园");
    assert.equal(ui.canvasAgent.visualStyleId,"oil");
  } finally {controller.dispose();}
});

test("composer loads project styles, defaults to anime and places model choices below the editor", async () => {
  const ui={canvasAgentCapabilityProfile:"media_generation_only",canvasAgent:{}};
  let loads=0;
  const controller=createCanvasAgentController({surface:{querySelector:()=>null},workbench:{ui,api:{
    async getProjectStyles(){loads++;return {styles:[
      {id:"official-anime",code:"anime_2d",name:"二次元",prompt_content:"二次元动漫风格，精致线稿"},
      {id:"official-oil",code:"oil_painting",name:"油画",prompt_content:"厚重油画笔触"},
      {id:"disabled",code:"disabled",name:"已停用",prompt_content:"不可用",status:"disabled"},
    ]};},
  }}});
  try {
    await controller.resume();
    const html=renderCanvasAgentPanel(ui);
    assert.equal(loads,1);
    assert.equal(ui.canvasAgent.visualStyleId,"official-anime");
    assert.match(html,/value="official-oil"/);
    assert.doesNotMatch(html,/value="disabled"/);
    assert.ok(html.indexOf('data-agent-prompt-editor') < html.indexOf('aria-label="默认生成模型"'));
    controller.handleInput({dataset:{agentField:"visualStyleId"},value:"official-oil"});
    renderCanvasAgentPanel(ui);
    assert.equal(ui.canvasAgent.visualStyleId,"official-oil");
  } finally {controller.dispose();}
});
test("visual style is visible, defaults to anime, and a selected style is submitted", async () => {
  const sent=[];
  const ui={canvasAgentCapabilityProfile:"media_generation_only",canvasAgent:{promptDraft:"校园短片",modelCode:"text",modelsStatus:"ready",models:[{modelCode:"text",modelLabel:"助手"}]}};
  const controller=createCanvasAgentController({surface:{querySelector:()=>null},workbench:{ui,api:{
    async createFreeGenerationConversation(){return {conversation:{id:"c"}};},
    async sendFreeGenerationMessage(id,input){sent.push(input);return {task:{id:"t",status:"queued"}};},
  }}});
  try {
    assert.match(renderCanvasAgentPanel(ui),/图片和视频默认风格/);
    assert.equal(ui.canvasAgent.visualStyleId,"anime");
    ui.canvasAgent.projectVisualStyles = [{id:"watercolor",label:"水彩插画",instruction:"项目原有水彩笔触"}];
    controller.handleInput({dataset:{agentField:"visualStyleId"},value:"watercolor"});
    await controller.handleAction({dataset:{agentAction:"send"}});
    assert.match(sent[0].message.text,/创作风格：水彩插画/);
    assert.match(sent[0].message.text,/校园短片/);
  } finally {controller.dispose()}
});
test("reusing a text message appends to the draft without submitting or exposing the skill command", async () => {
  const ui={canvasAgentCapabilityProfile:"media_generation_only",canvasAgent:{promptDraft:"保留草稿",messages:[{id:"m",role:"user",text:"/character-design 雨后的校园"}]}};
  const controller=createCanvasAgentController({surface:{querySelector:()=>null},workbench:{ui}});
  try {
    assert.match(renderCanvasAgentPanel(ui),/复制/);
    assert.match(renderCanvasAgentPanel(ui),/放入输入框/);
    await controller.handleAction({dataset:{agentAction:"reuse-agent-text",messageId:"m"}});
    assert.match(ui.canvasAgent.promptDraft,/^保留草稿\n\n/);
    assert.match(ui.canvasAgent.promptDraft,/雨后的校园/);
    assert.doesNotMatch(ui.canvasAgent.promptDraft,/\/character-design/);
  } finally {controller.dispose()}
});

test("catalog prompt details stay out of bubbles and reused text with a skill selected", async () => {
  const ui={canvasAgentCapabilityProfile:"media_generation_only",canvasAgent:{promptDraft:"保留草稿",projectVisualStyles:[{id:"oil",label:"油画",instruction:"厚重笔触"}],messages:[{id:"m",role:"user",text:'/character-design 创作风格：油画。\n风格描述："厚重笔触"\n校园人物'}]}};
  const controller=createCanvasAgentController({surface:{querySelector:()=>null},workbench:{ui}});
  try {
    const html=renderCanvasAgentPanel(ui);
    assert.equal(ui.canvasAgent.visualStyleId,"oil");
    assert.match(html,/创作风格：油画/);
    assert.doesNotMatch(html,/风格描述：/);
    await controller.handleAction({dataset:{agentAction:"reuse-agent-text",messageId:"m"}});
    assert.doesNotMatch(ui.canvasAgent.promptDraft,/创作风格：|风格描述：/);
    assert.match(ui.canvasAgent.promptDraft,/校园人物/);
  } finally {controller.dispose();}
});

test("copy writes the public text and reports a clipboard failure without clearing the draft", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const copied = [];
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard:{async writeText(text){copied.push(text);}}}});
  const ui={canvasAgentCapabilityProfile:"media_generation_only",canvasAgent:{promptDraft:"保留草稿",messages:[{id:"m",role:"user",text:"真人写实风格\n校园短片"}]}};
  const controller=createCanvasAgentController({surface:{querySelector:()=>null},workbench:{ui}});
  try {
    await controller.handleAction({dataset:{agentAction:"copy-agent-text",messageId:"m"}});
    assert.deepEqual(copied,["真人写实风格\n校园短片"]);
    assert.equal(ui.canvasAgent.copiedMessageKey,"m");
    globalThis.navigator.clipboard.writeText=async()=>{throw new Error("denied")};
    await controller.handleAction({dataset:{agentAction:"copy-agent-text",messageId:"m"}});
    assert.match(ui.canvasAgent.error,/复制未成功/);
    assert.equal(ui.canvasAgent.promptDraft,"保留草稿");
    assert.equal(ui.canvasAgent.copiedMessageKey,"");
  } finally {
    controller.dispose();
    if(original) Object.defineProperty(globalThis,"navigator",original);else delete globalThis.navigator;
  }
});

test("style selection reflects explicit corrections but not questions about a result", () => {
  for (const correction of ["不是动漫风格而是真人写实风格", "创作风格：真人写实。请问刚生成的是动漫风格吗？"]) {
    const ui={canvasAgentCapabilityProfile:"media_generation_only",canvasAgent:{messages:[{role:"user",text:"动漫风格"},{role:"user",text:correction}]}};
    renderCanvasAgentPanel(ui);
    assert.equal(ui.canvasAgent.visualStyleId,"realistic");
  }
});
