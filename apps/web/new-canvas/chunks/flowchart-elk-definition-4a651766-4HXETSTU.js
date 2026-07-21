import{a as et}from"./chunk-H47IJFP7.js";import{a as G,c as H}from"./chunk-WGJOMKX7.js";import{a as W,c as z,f as F,k as O,l as U,n as M}from"./chunk-TWQTCIDY.js";import"./chunk-6HJI6DHS.js";import{E as P,F as R,Fa as y,I as tt,Na as V,Sa as N,Ta as D,b as j,bb as B,db as A,g as I}from"./chunk-O22ID3PZ.js";import{a as Y}from"./chunk-PXOKQI6O.js";import{d as L}from"./chunk-NM6J3ND7.js";var Q=L(et(),1);var vt=L(j(),1),Tt=L(Y(),1),Et=L(tt(),1);var rt=(t,e,a)=>{let{parentById:r}=a,d=new Set,l=t;for(;l;){if(d.add(l),l===e)return l;l=r[l]}for(l=e;l;){if(d.has(l))return l;l=r[l]}return"root"},q=new Q.default,m={},ot={},$={},at=async function(t,e,a,r,d,l,n){let u=a.select(`[id="${e}"]`).insert("g").attr("class","nodes"),c=Object.keys(t);return await Promise.all(c.map(async function(p){let i=t[p],T="default";i.classes.length>0&&(T=i.classes.join(" ")),T=T+" flowchart-label";let w=D(i.styles),o=i.text!==void 0?i.text:i.id,f={width:0,height:0},b=[{id:i.id+"-west",layoutOptions:{"port.side":"WEST"}},{id:i.id+"-east",layoutOptions:{"port.side":"EAST"}},{id:i.id+"-south",layoutOptions:{"port.side":"SOUTH"}},{id:i.id+"-north",layoutOptions:{"port.side":"NORTH"}}],k=0,h="",g={};switch(i.type){case"round":k=5,h="rect";break;case"square":h="rect";break;case"diamond":h="question",g={portConstraints:"FIXED_SIDE"};break;case"hexagon":h="hexagon";break;case"odd":h="rect_left_inv_arrow";break;case"lean_right":h="lean_right";break;case"lean_left":h="lean_left";break;case"trapezoid":h="trapezoid";break;case"inv_trapezoid":h="inv_trapezoid";break;case"odd_right":h="rect_left_inv_arrow";break;case"circle":h="circle";break;case"ellipse":h="ellipse";break;case"stadium":h="stadium";break;case"subroutine":h="subroutine";break;case"cylinder":h="cylinder";break;case"group":h="rect";break;case"doublecircle":h="doublecircle";break;default:h="rect"}let E={labelStyle:w.labelStyle,shape:h,labelText:o,labelType:i.labelType,rx:k,ry:k,class:T,style:w.style,id:i.id,link:i.link,linkTarget:i.linkTarget,tooltip:d.db.getTooltip(i.id)||"",domId:d.db.lookUpDomId(i.id),haveCallback:i.haveCallback,width:i.type==="group"?500:void 0,dir:i.dir,type:i.type,props:i.props,padding:B().flowchart.padding},S,_;if(E.type!=="group")_=await F(u,E,i.dir),S=_.node().getBBox();else{r.createElementNS("http://www.w3.org/2000/svg","text");let{shapeSvg:v,bbox:x}=await z(u,E,void 0,!0);f.width=x.width,f.wrappingWidth=B().flowchart.wrappingWidth,f.height=x.height,f.labelNode=v.node(),E.labelData=f}let C={id:i.id,ports:i.type==="diamond"?b:[],layoutOptions:g,labelText:o,labelData:f,domId:d.db.lookUpDomId(i.id),width:S?.width,height:S?.height,type:i.type,el:_,parent:l.parentById[i.id]};$[E.id]=C})),n},J=(t,e,a)=>{let r={TB:{in:{north:"north"},out:{south:"west",west:"east",east:"south"}},LR:{in:{west:"west"},out:{east:"south",south:"north",north:"east"}},RL:{in:{east:"east"},out:{west:"north",north:"south",south:"west"}},BT:{in:{south:"south"},out:{north:"east",east:"west",west:"north"}}};return r.TD=r.TB,r[a][e][t]},K=(t,e,a)=>{if(y.info("getNextPort",{node:t,edgeDirection:e,graphDirection:a}),!m[t])switch(a){case"TB":case"TD":m[t]={inPosition:"north",outPosition:"south"};break;case"BT":m[t]={inPosition:"south",outPosition:"north"};break;case"RL":m[t]={inPosition:"east",outPosition:"west"};break;case"LR":m[t]={inPosition:"west",outPosition:"east"};break}let r=e==="in"?m[t].inPosition:m[t].outPosition;return e==="in"?m[t].inPosition=J(m[t].inPosition,e,a):m[t].outPosition=J(m[t].outPosition,e,a),r},st=(t,e)=>{let a=t.start,r=t.end,d=a,l=r,n=$[a],s=$[r];return!n||!s?{source:a,target:r}:(n.type==="diamond"&&(a=`${a}-${K(a,"out",e)}`),s.type==="diamond"&&(r=`${r}-${K(r,"in",e)}`),{source:a,target:r,sourceId:d,targetId:l})},lt=function(t,e,a,r){y.info("abc78 edges = ",t);let d=r.insert("g").attr("class","edgeLabels"),l={},n=e.db.getDirection(),s,u;if(t.defaultStyle!==void 0){let c=D(t.defaultStyle);s=c.style,u=c.labelStyle}return t.forEach(function(c){let p="L-"+c.start+"-"+c.end;l[p]===void 0?(l[p]=0,y.info("abc78 new entry",p,l[p])):(l[p]++,y.info("abc78 new entry",p,l[p]));let i=p+"-"+l[p];y.info("abc78 new link id to be used is",p,i,l[p]);let T="LS-"+c.start,w="LE-"+c.end,o={style:"",labelStyle:""};switch(o.minlen=c.length||1,c.type==="arrow_open"?o.arrowhead="none":o.arrowhead="normal",o.arrowTypeStart="arrow_open",o.arrowTypeEnd="arrow_open",c.type){case"double_arrow_cross":o.arrowTypeStart="arrow_cross";case"arrow_cross":o.arrowTypeEnd="arrow_cross";break;case"double_arrow_point":o.arrowTypeStart="arrow_point";case"arrow_point":o.arrowTypeEnd="arrow_point";break;case"double_arrow_circle":o.arrowTypeStart="arrow_circle";case"arrow_circle":o.arrowTypeEnd="arrow_circle";break}let f="",b="";switch(c.stroke){case"normal":f="fill:none;",s!==void 0&&(f=s),u!==void 0&&(b=u),o.thickness="normal",o.pattern="solid";break;case"dotted":o.thickness="normal",o.pattern="dotted",o.style="fill:none;stroke-width:2px;stroke-dasharray:3;";break;case"thick":o.thickness="thick",o.pattern="solid",o.style="stroke-width: 3.5px;fill:none;";break}if(c.style!==void 0){let _=D(c.style);f=_.style,b=_.labelStyle}o.style=o.style+=f,o.labelStyle=o.labelStyle+=b,c.interpolate!==void 0?o.curve=N(c.interpolate,P):t.defaultInterpolate!==void 0?o.curve=N(t.defaultInterpolate,P):o.curve=N(ot.curve,P),c.text===void 0?c.style!==void 0&&(o.arrowheadStyle="fill: #333"):(o.arrowheadStyle="fill: #333",o.labelpos="c"),o.labelType=c.labelType,o.label=c.text.replace(V.lineBreakRegex,`
`),c.style===void 0&&(o.style=o.style||"stroke: #333; stroke-width: 1.5px;fill:none;"),o.labelStyle=o.labelStyle.replace("color:","fill:"),o.id=i,o.classes="flowchart-link "+T+" "+w;let k=M(d,o),{source:h,target:g,sourceId:E,targetId:S}=st(c,n);y.debug("abc78 source and target",h,g),a.edges.push({id:"e"+c.start+c.end,sources:[h],targets:[g],sourceId:E,targetId:S,labelEl:k,labels:[{width:o.width,height:o.height,orgWidth:o.width,orgHeight:o.height,text:o.label,layoutOptions:{"edgeLabels.inline":"true","edgeLabels.placement":"CENTER"}}],edgeData:o})}),a},it=function(t,e,a,r,d){let l="";r&&(l=window.location.protocol+"//"+window.location.host+window.location.pathname+window.location.search,l=l.replace(/\(/g,"\\("),l=l.replace(/\)/g,"\\)")),U(t,e,l,d,a)},nt=function(t,e){return y.info("Extracting classes"),e.db.getClasses()},ct=function(t){let e={parentById:{},childrenById:{}},a=t.getSubGraphs();return y.info("Subgraphs - ",a),a.forEach(function(r){r.nodes.forEach(function(d){e.parentById[d]=r.id,e.childrenById[r.id]===void 0&&(e.childrenById[r.id]=[]),e.childrenById[r.id].push(d)})}),a.forEach(function(r){r.id,e.parentById[r.id]!==void 0&&e.parentById[r.id]}),e},dt=function(t,e,a){let r=rt(t,e,a);if(r===void 0||r==="root")return{x:0,y:0};let d=$[r].offset;return{x:d.posX,y:d.posY}},ht=function(t,e,a,r,d,l){let n=dt(e.sourceId,e.targetId,d),s=e.sections[0].startPoint,u=e.sections[0].endPoint,p=(e.sections[0].bendPoints?e.sections[0].bendPoints:[]).map(g=>[g.x+n.x,g.y+n.y]),i=[[s.x+n.x,s.y+n.y],...p,[u.x+n.x,u.y+n.y]],{x:T,y:w}=O(e.edgeData),o=R().x(T).y(w).curve(P),f=t.insert("path").attr("d",o(i)).attr("class","path "+a.classes).attr("fill","none"),b=t.insert("g").attr("class","edgeLabel"),k=I(b.node().appendChild(e.labelEl)),h=k.node().firstChild.getBoundingClientRect();k.attr("width",h.width),k.attr("height",h.height),b.attr("transform",`translate(${e.labels[0].x+n.x}, ${e.labels[0].y+n.y})`),it(f,a,r.type,r.arrowMarkerAbsolute,l)},Z=(t,e)=>{t.forEach(a=>{a.children||(a.children=[]);let r=e.childrenById[a.id];r&&r.forEach(d=>{a.children.push($[d])}),Z(a.children,e)})},pt=async function(t,e,a,r){var d;r.db.clear(),$={},m={},r.db.setGen("gen-2"),r.parser.parse(t);let l=I("body").append("div").attr("style","height:400px").attr("id","cy"),n={id:"root",layoutOptions:{"elk.hierarchyHandling":"INCLUDE_CHILDREN","org.eclipse.elk.padding":"[top=100, left=100, bottom=110, right=110]","elk.layered.spacing.edgeNodeBetweenLayers":"30","elk.direction":"DOWN"},children:[],edges:[]};switch(y.info("Drawing flowchart using v3 renderer",q),r.db.getDirection()){case"BT":n.layoutOptions["elk.direction"]="UP";break;case"TB":n.layoutOptions["elk.direction"]="DOWN";break;case"LR":n.layoutOptions["elk.direction"]="RIGHT";break;case"RL":n.layoutOptions["elk.direction"]="LEFT";break}let{securityLevel:u,flowchart:c}=B(),p;u==="sandbox"&&(p=I("#i"+e));let i=u==="sandbox"?I(p.nodes()[0].contentDocument.body):I("body"),T=u==="sandbox"?p.nodes()[0].contentDocument:document,w=i.select(`[id="${e}"]`);W(w,["point","circle","cross"],r.type,e);let f=r.db.getVertices(),b,k=r.db.getSubGraphs();y.info("Subgraphs - ",k);for(let v=k.length-1;v>=0;v--)b=k[v],r.db.addVertex(b.id,{text:b.title,type:b.labelType},"group",void 0,b.classes,b.dir);let h=w.insert("g").attr("class","subgraphs"),g=ct(r.db);n=await at(f,e,i,T,r,g,n);let E=w.insert("g").attr("class","edges edgePath"),S=r.db.getEdges();n=lt(S,r,n,w),Object.keys($).forEach(v=>{let x=$[v];x.parent||n.children.push(x),g.childrenById[v]!==void 0&&(x.labels=[{text:x.labelText,layoutOptions:{"nodeLabels.placement":"[H_CENTER, V_TOP, INSIDE]"},width:x.labelData.width,height:x.labelData.height}],delete x.x,delete x.y,delete x.width,delete x.height)}),Z(n.children,g),y.info("after layout",JSON.stringify(n,null,2));let C=await q.layout(n);X(0,0,C.children,w,h,r,0),y.info("after layout",C),(d=C.edges)==null||d.map(v=>{ht(E,v,v.edgeData,r,g,e)}),A({},w,c.diagramPadding,c.useMaxWidth),l.remove()},X=(t,e,a,r,d,l,n)=>{a.forEach(function(s){if(s)if($[s.id].offset={posX:s.x+t,posY:s.y+e,x:t,y:e,depth:n,width:s.width,height:s.height},s.type==="group"){let u=d.insert("g").attr("class","subgraph");u.insert("rect").attr("class","subgraph subgraph-lvl-"+n%5+" node").attr("x",s.x+t).attr("y",s.y+e).attr("width",s.width).attr("height",s.height);let c=u.insert("g").attr("class","label"),p=B().flowchart.htmlLabels?s.labelData.width/2:0;c.attr("transform",`translate(${s.labels[0].x+t+s.x+p}, ${s.labels[0].y+e+s.y+3})`),c.node().appendChild(s.labelData.labelNode),y.info("Id (UGH)= ",s.type,s.labels)}else y.info("Id (UGH)= ",s.id),s.el.attr("transform",`translate(${s.x+t+s.width/2}, ${s.y+e+s.height/2})`)}),a.forEach(function(s){s&&s.type==="group"&&X(t+s.x,e+s.y,s.children,r,d,l,n+1)})},ut={getClasses:nt,draw:pt},ft=t=>{let e="";for(let a=0;a<5;a++)e+=`
      .subgraph-lvl-${a} {
        fill: ${t[`surface${a}`]};
        stroke: ${t[`surfacePeer${a}`]};
      }
    `;return e},bt=t=>`.label {
    font-family: ${t.fontFamily};
    color: ${t.nodeTextColor||t.textColor};
  }
  .cluster-label text {
    fill: ${t.titleColor};
  }
  .cluster-label span {
    color: ${t.titleColor};
  }

  .label text,span {
    fill: ${t.nodeTextColor||t.textColor};
    color: ${t.nodeTextColor||t.textColor};
  }

  .node rect,
  .node circle,
  .node ellipse,
  .node polygon,
  .node path {
    fill: ${t.mainBkg};
    stroke: ${t.nodeBorder};
    stroke-width: 1px;
  }

  .node .label {
    text-align: center;
  }
  .node.clickable {
    cursor: pointer;
  }

  .arrowheadPath {
    fill: ${t.arrowheadColor};
  }

  .edgePath .path {
    stroke: ${t.lineColor};
    stroke-width: 2.0px;
  }

  .flowchart-link {
    stroke: ${t.lineColor};
    fill: none;
  }

  .edgeLabel {
    background-color: ${t.edgeLabelBackground};
    rect {
      opacity: 0.85;
      background-color: ${t.edgeLabelBackground};
      fill: ${t.edgeLabelBackground};
    }
    text-align: center;
  }

  .cluster rect {
    fill: ${t.clusterBkg};
    stroke: ${t.clusterBorder};
    stroke-width: 1px;
  }

  .cluster text {
    fill: ${t.titleColor};
  }

  .cluster span {
    color: ${t.titleColor};
  }
  /* .cluster div {
    color: ${t.titleColor};
  } */

  div.mermaidTooltip {
    position: absolute;
    text-align: center;
    max-width: 200px;
    padding: 2px;
    font-family: ${t.fontFamily};
    font-size: 12px;
    background: ${t.tertiaryColor};
    border: 1px solid ${t.border2};
    border-radius: 2px;
    pointer-events: none;
    z-index: 100;
  }

  .flowchartTitleText {
    text-anchor: middle;
    font-size: 18px;
    fill: ${t.textColor};
  }
  .subgraph {
    stroke-width:2;
    rx:3;
  }
  // .subgraph-lvl-1 {
  //   fill:#ccc;
  //   // stroke:black;
  // }

  .flowchart-label text {
    text-anchor: middle;
  }

  ${ft(t)}
`,yt=bt,St={db:H,renderer:ut,parser:G,styles:yt};export{St as diagram};
