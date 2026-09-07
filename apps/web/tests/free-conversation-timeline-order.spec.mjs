import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createCanvasAgentController} from '../src/features/new-canvas/canvas-agent-panel.js';

test('live refresh inserts restored history before newer results and repairs misplaced entries without replacing media', () => {
  const originalDocument=globalThis.document;
  function container() { return {children:[],get firstElementChild(){return this.children[0]??null;},insertBefore(node,anchor){node.remove();const i=anchor?this.children.indexOf(anchor):this.children.length;assert.ok(i>=0);this.children.splice(i,0,node);node.parentElement=this;},append(node){this.insertBefore(node,null);}}; }
  function entry(id,html=id) { return {dataset:{agentTimelineEntry:id},outerHTML:html,parentElement:null,get isConnected(){return Boolean(this.parentElement);},get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]??null;},remove(){if(this.parentElement){const p=this.parentElement;p.children.splice(p.children.indexOf(this),1);this.parentElement=null;}},cloneNode(){return entry(id,html);},replaceWith(node){const p=this.parentElement;const i=p.children.indexOf(this);this.remove();p.children.splice(i,0,node);node.parentElement=p;}}; }
  const feed=container(), timeline=container();
  const first=entry('first'), video=entry('video'), misplaced=entry('misplaced');
  feed.append(first);feed.append(video);timeline.append(misplaced);
  timeline.querySelectorAll=()=>[...feed.children,...timeline.children];
  timeline.querySelector=selector=>selector==='.canvas-agent-media-feed'?feed:null;
  const expected=[entry('first'),entry('old-style'),entry('misplaced'),entry('video')];
  const nextTimeline={querySelectorAll:()=>expected};
  const panel={querySelector:selector=>selector==='.canvas-agent-timeline'?timeline:null};
  const nextPanel={querySelector:selector=>selector==='.canvas-agent-timeline'?nextTimeline:null};
  globalThis.document={createElement:()=>({content:{firstElementChild:nextPanel},set innerHTML(value){}})};
  const controller=createCanvasAgentController({surface:{querySelector:()=>panel},workbench:{ui:{canvasAgentCapabilityProfile:'media_generation_only'},api:{}}});
  try{
    controller.syncPanel({liveOnly:true});
    assert.deepEqual(feed.children.map(e=>e.dataset.agentTimelineEntry),expected.map(e=>e.dataset.agentTimelineEntry));
    assert.equal(feed.children.at(-1),video);
    assert.equal(timeline.children.length,0);
    controller.syncPanel({liveOnly:true});
    assert.equal(feed.children.at(-1),video);
  }finally{controller.dispose();if(originalDocument===undefined)delete globalThis.document;else globalThis.document=originalDocument;}
});
