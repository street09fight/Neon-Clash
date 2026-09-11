(() => {
'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W=1280,H=720;
const ui = id => document.getElementById(id);
const screens=[...document.querySelectorAll('.screen')];
const showScreen=id=>{screens.forEach(s=>s.classList.remove('active')); if(id) ui(id).classList.add('active')};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const sign=v=>v<0?-1:1;
const rectHit=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const rand=(a,b)=>a+Math.random()*(b-a);

const FIGHTERS={
  nova:{name:'NOVA',type:'Balanced',color:'#ff4f70',accent:'#ffd26a',mass:1.0,speed:6.0,air:0.38,jump:13.6,doubleJump:11.7,fall:0.72,maxFall:13.5,shield:100,power:1.0,special:'flare'},
  brute:{name:'BRUTE',type:'Heavy',color:'#5bdb86',accent:'#b7ffce',mass:1.38,speed:4.5,air:0.29,jump:11.6,doubleJump:9.8,fall:0.78,maxFall:14.3,shield:112,power:1.24,special:'quake'},
  volt:{name:'VOLT',type:'Rushdown',color:'#58a8ff',accent:'#bcecff',mass:.84,speed:7.1,air:0.46,jump:14.7,doubleJump:12.7,fall:.68,maxFall:12.9,shield:90,power:.9,special:'dash'},
  aria:{name:'ARIA',type:'Zoner',color:'#b975ff',accent:'#f2d7ff',mass:.9,speed:5.35,air:.41,jump:13.9,doubleJump:12.4,fall:.64,maxFall:12.2,shield:94,power:.93,special:'orb'}
};
const fighterOrder=Object.keys(FIGHTERS);
const STAGES={
  summit:{name:'Sky Summit',bg1:'#21304d',bg2:'#8dc5ff',platforms:[{x:250,y:548,w:780,h:34,type:'solid'},{x:390,y:410,w:210,h:22,type:'pass'},{x:680,y:410,w:210,h:22,type:'pass'},{x:535,y:300,w:210,h:22,type:'pass'}],blast:{l:-150,r:1430,t:-180,b:860}},
  neon:{name:'Neon Grid',bg1:'#120d29',bg2:'#31105b',platforms:[{x:220,y:555,w:840,h:34,type:'solid'},{x:330,y:430,w:220,h:20,type:'pass'},{x:730,y:430,w:220,h:20,type:'pass'}],blast:{l:-170,r:1450,t:-190,b:870}},
  ruins:{name:'Crimson Ruins',bg1:'#2b1315',bg2:'#8d3e34',platforms:[{x:180,y:560,w:920,h:34,type:'solid'},{x:270,y:420,w:180,h:20,type:'pass'},{x:550,y:350,w:180,h:20,type:'pass'},{x:830,y:420,w:180,h:20,type:'pass'}],blast:{l:-180,r:1460,t:-190,b:890}}
};
const stageOrder=Object.keys(STAGES);

const ATTACKS={
 neutral:{startup:5,active:4,recovery:10,damage:5,base:4.6,scale:.115,angle:-0.35,range:54,h:40,offsetY:-34},
 forward:{startup:7,active:5,recovery:14,damage:9,base:6.4,scale:.16,angle:-0.42,range:68,h:42,offsetY:-38},
 up:{startup:6,active:5,recovery:14,damage:8,base:6,scale:.15,angle:-1.36,range:48,h:64,offsetY:-78},
 down:{startup:6,active:6,recovery:15,damage:7,base:5.5,scale:.13,angle:.12,range:72,h:28,offsetY:-18},
 airN:{startup:4,active:12,recovery:12,damage:6,base:5,scale:.12,angle:-.55,range:58,h:58,offsetY:-46},
 airF:{startup:7,active:6,recovery:16,damage:10,base:7.2,scale:.16,angle:-.34,range:74,h:42,offsetY:-42},
 airU:{startup:5,active:7,recovery:13,damage:7,base:5.8,scale:.14,angle:-1.32,range:58,h:60,offsetY:-75},
 airD:{startup:8,active:8,recovery:18,damage:11,base:7,scale:.14,angle:1.3,range:48,h:68,offsetY:-12}
};

const input={left:false,right:false,up:false,down:false,attack:false,special:false,shield:false,grab:false};
const pressed={};
function press(k,v){if(v&&!input[k]) pressed[k]=true; input[k]=v}
const keyMap={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'up',ArrowUp:'up',Space:'up',KeyS:'down',ArrowDown:'down',KeyJ:'attack',KeyK:'special',KeyL:'shield',KeyI:'grab'};
addEventListener('keydown',e=>{if(keyMap[e.code]){e.preventDefault();press(keyMap[e.code],true)} if(e.code==='Escape'&&state.mode==='match') togglePause()});
addEventListener('keyup',e=>{if(keyMap[e.code]){e.preventDefault();press(keyMap[e.code],false)}});
for(const b of document.querySelectorAll('[data-key]')){
  const k=b.dataset.key;
  const on=e=>{e.preventDefault();press(k,true)}; const off=e=>{e.preventDefault();press(k,false)};
  b.addEventListener('pointerdown',on); b.addEventListener('pointerup',off); b.addEventListener('pointercancel',off); b.addEventListener('pointerleave',off);
}

let state={mode:'title',p1:'nova',stage:'summit',fighters:[],projectiles:[],effects:[],time:300*60,paused:false,countdown:0,winner:null,shake:0};

class Fighter{
 constructor(id,key,x,y,dir,cpu=false){
   this.id=id;this.key=key;this.def=FIGHTERS[key];this.x=x;this.y=y;this.vx=0;this.vy=0;this.w=42;this.h=72;this.dir=dir;this.cpu=cpu;
   this.percent=0;this.stocks=3;this.onGround=false;this.jumps=2;this.attack=null;this.attackFrame=0;this.attackHit=false;this.hitstun=0;this.inv=90;this.shield=this.def.shield;this.shielding=false;this.dodge=0;this.grab=0;this.grabbedBy=null;this.respawn=0;this.dead=false;this.fastfall=false;this.flash=0;this.ai={think:0,left:false,right:false,up:false,down:false,attack:false,special:false,shield:false,grab:false};
 }
 get hurtbox(){return{x:this.x-this.w/2,y:this.y-this.h,w:this.w,h:this.h}}
 control(){
   if(this.cpu) return this.ai;
   return input;
 }
 just(k){return this.cpu?!!this.ai['p_'+k]:!!pressed[k]}
 update(stage){
   if(this.dead)return;
   if(this.respawn>0){this.respawn--;this.inv=Math.max(this.inv,60); if(this.respawn===1){this.x=this.id===1?470:810;this.y=150;this.vx=0;this.vy=0;} return}
   if(this.flash>0)this.flash--;
   if(this.inv>0)this.inv--;
   if(this.hitstun>0){this.hitstun--;this.physics(stage,true);return}
   if(this.dodge>0){this.dodge--;this.inv=Math.max(this.inv,2);this.physics(stage,false);return}
   const c=this.control();
   this.shielding=false;
   if(this.attack){this.attackFrame++; const a=this.attack.data; if(this.attackFrame>=a.startup+a.active+a.recovery){this.attack=null;this.attackFrame=0;this.attackHit=false} this.physics(stage,false);return}
   if(this.grab>0){this.grab--;this.physics(stage,false);return}
   if(c.shield&&this.onGround){this.shielding=true;this.vx*=.72;this.shield=Math.max(0,this.shield-.12);if(this.shield<=0){this.shielding=false;this.hitstun=90;this.shield=45;burst(this.x,this.y-42,'#fff',18)}return}else this.shield=Math.min(this.def.shield,this.shield+.18);
   if(this.just('shield')){ if(!this.onGround){this.dodge=22;this.inv=18;this.vx*=.5;this.vy*=.5;return} if(c.left||c.right){this.dodge=18;this.inv=15;this.vx=(c.left?-1:1)*9.5;this.dir=c.left?-1:1;return}}
   if(this.just('grab')){this.grab=18; tryGrab(this); return}
   if(this.just('attack')) this.beginAttack();
   else if(this.just('special')) this.beginSpecial();
   if(!this.attack&&!this.grab){
     let move=0;if(c.left)move--;if(c.right)move++;
     if(move){this.dir=move;const target=move*this.def.speed;this.vx=lerp(this.vx,target,this.onGround?.26:this.def.air)} else if(this.onGround)this.vx*=.74;
     if(this.just('up')&&this.onGround){this.vy=-this.def.jump;this.onGround=false;this.jumps=1;this.fastfall=false}
     else if(this.just('up')&&!this.onGround&&this.jumps>0){this.vy=-this.def.doubleJump;this.jumps--;this.fastfall=false;burst(this.x,this.y,'#ffffff99',6)}
     if(c.down&&!this.onGround&&this.vy>0){this.fastfall=true;this.vy=Math.min(this.vy+1.0,this.def.maxFall*1.28)}
   }
   this.physics(stage,false);
 }
 beginAttack(){
   const c=this.control(); let key;
   if(!this.onGround){key=c.down?'airD':c.up?'airU':(c.left||c.right)?'airF':'airN'}
   else key=c.down?'down':c.up?'up':(c.left||c.right)?'forward':'neutral';
   this.attack={kind:'normal',name:key,data:{...ATTACKS[key]}};this.attackFrame=0;this.attackHit=false;
 }
 beginSpecial(){
   const c=this.control(); const dir=c.up?'up':c.down?'down':(c.left||c.right)?'side':'neutral';
   const sp=this.def.special;
   if(sp==='flare'){
      if(dir==='up'){this.vy=-15.5;this.vx=this.dir*2.5;this.attack={kind:'special',name:'rise',data:{startup:3,active:16,recovery:22,damage:11,base:8.4,scale:.15,angle:-1.15,range:54,h:76,offsetY:-64}}}
      else if(dir==='side'){this.vx=this.dir*11.5;this.attack={kind:'special',name:'burst',data:{startup:4,active:12,recovery:17,damage:12,base:8,scale:.17,angle:-.32,range:70,h:44,offsetY:-38}}}
      else {spawnProjectile(this,'flare');this.attack={kind:'special',name:'cast',data:{startup:6,active:1,recovery:18,damage:0,base:0,scale:0,angle:0,range:0,h:0,offsetY:0}}}
   }else if(sp==='quake'){
      if(dir==='up'){this.vy=-12.4;this.attack={kind:'special',name:'upper',data:{startup:6,active:10,recovery:24,damage:15,base:10,scale:.18,angle:-1.28,range:62,h:90,offsetY:-78}}}
      else if(dir==='down'){this.attack={kind:'special',name:'slam',data:{startup:10,active:8,recovery:28,damage:18,base:11,scale:.18,angle:-1.0,range:100,h:45,offsetY:-20}}}
      else {this.attack={kind:'special',name:'hammer',data:{startup:10,active:8,recovery:24,damage:17,base:11,scale:.2,angle:-.34,range:84,h:52,offsetY:-44}}}
   }else if(sp==='dash'){
      if(dir==='up'){this.vy=-16.2;this.attack={kind:'special',name:'sparkup',data:{startup:2,active:14,recovery:20,damage:9,base:7,scale:.14,angle:-1.3,range:50,h:70,offsetY:-62}}}
      else {this.vx=this.dir*15.2;this.attack={kind:'special',name:'zip',data:{startup:2,active:10,recovery:15,damage:8,base:6,scale:.13,angle:-.3,range:64,h:38,offsetY:-36}}}
   }else if(sp==='orb'){
      if(dir==='up'){this.vy=-13.8;this.attack={kind:'special',name:'lift',data:{startup:5,active:12,recovery:20,damage:8,base:6.7,scale:.13,angle:-1.36,range:56,h:80,offsetY:-70}}}
      else {spawnProjectile(this,dir==='side'?'orbFast':'orb');this.attack={kind:'special',name:'cast',data:{startup:7,active:1,recovery:19,damage:0,base:0,scale:0,angle:0,range:0,h:0,offsetY:0}}}
   }
   this.attackFrame=0;this.attackHit=false;
 }
 physics(stage,inStun){
   this.vy=Math.min(this.vy+this.def.fall,this.fastfall?this.def.maxFall*1.28:this.def.maxFall);
   const oldY=this.y;this.x+=this.vx;this.y+=this.vy;this.onGround=false;
   const hb=this.hurtbox;
   for(const p of stage.platforms){
     const descending=this.vy>=0;const prevBottom=oldY; const nowBottom=this.y;
     const withinX=this.x+this.w/2>p.x&&this.x-this.w/2<p.x+p.w;
     const drop=this.control().down&&p.type==='pass';
     if(withinX&&descending&&!drop&&prevBottom<=p.y+5&&nowBottom>=p.y){this.y=p.y;this.vy=0;this.onGround=true;this.jumps=2;this.fastfall=false; if(Math.abs(this.vx)<.15)this.vx=0}
   }
   this.x=clamp(this.x,-260,1540);
 }
 draw(){
   if(this.dead||this.respawn>0&&this.respawn>35)return;
   const x=this.x,y=this.y;ctx.save();ctx.translate(x,y);ctx.scale(this.dir,1);
   if(this.inv>0&&Math.floor(this.inv/4)%2===0)ctx.globalAlpha=.45;
   const c=this.flash>0?'#fff':this.def.color;const a=this.def.accent;
   if(this.shielding){ctx.save();ctx.scale(this.dir,1);ctx.globalAlpha=.38;ctx.fillStyle=a;ctx.beginPath();ctx.arc(0,-38,48*(this.shield/this.def.shield*.35+.65),0,Math.PI*2);ctx.fill();ctx.restore()}
   // shadowed vector fighter
   ctx.fillStyle='#0008';ctx.beginPath();ctx.ellipse(0,2,32,8,0,0,Math.PI*2);ctx.fill();
   // legs
   ctx.strokeStyle=c;ctx.lineWidth=13;ctx.lineCap='round';
   let kick=0,arm=0,lean=0;
   if(this.attack){const t=this.attackFrame;lean=Math.sin(Math.min(1,t/8)*Math.PI)*5;arm=Math.sin(Math.min(1,t/7)*Math.PI)*34;kick=this.attack.name.includes('down')?28:Math.sin(Math.min(1,t/8)*Math.PI)*20}
   ctx.beginPath();ctx.moveTo(-10,-18);ctx.lineTo(-14+kick*.2,0);ctx.moveTo(10,-18);ctx.lineTo(16+kick,0);ctx.stroke();
   // body
   ctx.fillStyle=c;roundRect(ctx,-24+lean,-65,48,48,13,true,false);
   // belt/core
   ctx.fillStyle=a;roundRect(ctx,-18+lean,-43,36,8,4,true,false);
   // arms
   ctx.strokeStyle=c;ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(-18+lean,-53);ctx.lineTo(-34-arm*.2,-32);ctx.moveTo(18+lean,-53);ctx.lineTo(34+arm,-39);ctx.stroke();
   // head
   ctx.fillStyle=a;ctx.beginPath();ctx.arc(lean,-83,17,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#10131a';ctx.fillRect(5+lean,-88,10,5);
   if(this.grab>0){ctx.strokeStyle='#ffd76b';ctx.lineWidth=4;ctx.beginPath();ctx.arc(38,-38,22,0,Math.PI*2);ctx.stroke()}
   ctx.restore();
 }
}

function roundRect(c,x,y,w,h,r,fill,stroke){if(w<2*r)r=w/2;if(h<2*r)r=h/2;c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);if(fill)c.fill();if(stroke)c.stroke()}
function spawnProjectile(f,type){
 const fast=type==='orbFast';state.projectiles.push({x:f.x+f.dir*45,y:f.y-48,vx:f.dir*(fast?11:type==='flare'?9:7),vy:type==='flare'?-0.2:0,w:26,h:20,life:130,owner:f,damage:type==='flare'?7:8,base:5.5,scale:.12,color:f.def.accent});
}
function tryGrab(f){const o=state.fighters.find(x=>x!==f&&!x.dead);if(!o)return;const r={x:f.x+(f.dir>0?18:-68),y:f.y-64,w:50,h:60};if(rectHit(r,o.hurtbox)&&o.inv<=0&&!o.shielding){o.hitstun=24;o.vx=f.dir*3;o.vy=-2;o.percent+=3;burst(o.x,o.y-40,'#ffd76b',10)}}
function hitFighter(attacker,target,a){
 if(target.inv>0||target.dead)return false;
 if(target.shielding){const shieldD=a.damage*1.4;target.shield-=shieldD;target.vx+=attacker.dir*1.2;burst(target.x,target.y-42,target.def.accent,7);if(target.shield<=0){target.hitstun=100;target.shield=38;target.shielding=false;burst(target.x,target.y-40,'#fff',26)}return true}
 target.percent+=a.damage*attacker.def.power;const kb=(a.base+a.scale*target.percent)*attacker.def.power/target.def.mass;let ang=a.angle;if(attacker.dir<0)ang=Math.PI-ang;target.vx=Math.cos(ang)*kb;target.vy=Math.sin(ang)*kb;target.hitstun=Math.round(10+kb*2.25);target.flash=6;state.shake=Math.max(state.shake,Math.min(18,kb*.7));burst(target.x,target.y-40,attacker.def.accent,12);return true;
}
function attackHitbox(f){if(!f.attack)return null;const a=f.attack.data;if(f.attackFrame<a.startup||f.attackFrame>=a.startup+a.active||a.damage<=0)return null;const x=f.dir>0?f.x+22:f.x-22-a.range;return{x,y:f.y+a.offsetY,w:a.range,h:a.h}}
function burst(x,y,color,n){for(let i=0;i<n;i++)state.effects.push({x,y,vx:rand(-4,4),vy:rand(-5,2),life:rand(10,25),max:25,color,size:rand(2,7)})}

function updateAI(f,opp){
 const a=f.ai;for(const k of ['left','right','up','down','attack','special','shield','grab','p_left','p_right','p_up','p_down','p_attack','p_special','p_shield','p_grab'])a[k]=false;
 if(f.hitstun||f.attack||f.grab||f.respawn)return;
 const dx=opp.x-f.x,dy=opp.y-f.y,dist=Math.abs(dx);
 if(f.y>620||Math.abs(f.x-640)>520){a[dx>0?'right':'left']=true;if(f.onGround||f.jumps>0){a.up=true;a.p_up=true}if(Math.random()<.035){a.special=true;a.p_special=true}return}
 if(dist>95){a[dx>0?'right':'left']=true;if(Math.random()<.012&&f.onGround){a.up=true;a.p_up=true}if(dist>260&&Math.random()<.02){a.special=true;a.p_special=true}}
 else{
   if(Math.random()<.018&&opp.attack){a.shield=true;a.p_shield=true;return}
   if(Math.random()<.055){a.attack=true;a.p_attack=true;if(Math.random()<.45)a[dx>0?'right':'left']=true;else if(Math.random()<.35)a.up=true}
   else if(Math.random()<.018){a.grab=true;a.p_grab=true}
   else a[dx>0?'right':'left']=Math.random()<.35;
 }
 if(dy<-95&&Math.random()<.03){a.up=true;a.p_up=true}
}

function checkCombat(){
 for(const f of state.fighters){const hb=attackHitbox(f);if(!hb||f.attackHit)continue;for(const o of state.fighters){if(o===f||o.dead)continue;if(rectHit(hb,o.hurtbox)){if(hitFighter(f,o,f.attack.data))f.attackHit=true}}}
 for(let i=state.projectiles.length-1;i>=0;i--){const p=state.projectiles[i];p.x+=p.vx;p.y+=p.vy;p.life--;let remove=p.life<=0;for(const o of state.fighters){if(o===p.owner||o.dead)continue;const r={x:p.x-p.w/2,y:p.y-p.h/2,w:p.w,h:p.h};if(rectHit(r,o.hurtbox)){hitFighter(p.owner,o,p);remove=true;break}}if(remove)state.projectiles.splice(i,1)}
}
function checkBlast(){const b=STAGES[state.stage].blast;for(const f of state.fighters){if(f.dead||f.respawn>0)continue;if(f.x<b.l||f.x>b.r||f.y<b.t||f.y>b.b){f.stocks--;burst(clamp(f.x,0,W),clamp(f.y,0,H),'#fff',32);if(f.stocks<=0){f.dead=true}else{f.percent=0;f.respawn=110;f.x=f.id===1?470:810;f.y=-100;f.vx=f.vy=0}updateHud();checkWinner()}}
}
function checkWinner(){const alive=state.fighters.filter(f=>!f.dead);if(alive.length<=1&&!state.winner){state.winner=alive[0]||null;state.countdown=180;showBanner(state.winner?`${state.winner.def.name} WINS!`:'DRAW',180)}}
function startMatch(){
 state.mode='match';state.paused=false;state.winner=null;state.projectiles=[];state.effects=[];state.time=300*60;state.shake=0;const p1=new Fighter(1,state.p1,430,280,1,false);let cpuKey=fighterOrder[(fighterOrder.indexOf(state.p1)+1)%fighterOrder.length];const p2=new Fighter(2,cpuKey,850,280,-1,true);state.fighters=[p1,p2];
 showScreen(null);ui('hud').classList.remove('hidden');ui('pauseBtn').classList.remove('hidden');if(matchMedia('(pointer: coarse)').matches)ui('mobileControls').classList.remove('hidden');
 state.countdown=180;showBanner('3',55);setTimeout(()=>{if(state.mode==='match')showBanner('2',55)},900);setTimeout(()=>{if(state.mode==='match')showBanner('1',55)},1800);setTimeout(()=>{if(state.mode==='match')showBanner('GO!',45)},2700);updateHud();
}
function showBanner(txt,frames=60){ui('matchBanner').textContent=txt;ui('matchBanner').classList.remove('hidden');state.bannerFrames=frames}
function updateHud(){const [a,b]=state.fighters;if(!a||!b)return;ui('p1Name').textContent=a.def.name;ui('p2Name').textContent=b.def.name+'  CPU';ui('p1Pct').textContent=Math.round(a.percent);ui('p2Pct').textContent=Math.round(b.percent);ui('p1Stocks').textContent='◆'.repeat(Math.max(0,a.stocks));ui('p2Stocks').textContent='◆'.repeat(Math.max(0,b.stocks))}
function togglePause(){if(state.mode!=='match')return;state.paused=!state.paused;ui('pauseMenu').classList.toggle('hidden',!state.paused)}
function quit(){state.mode='title';state.paused=false;state.fighters=[];state.projectiles=[];ui('hud').classList.add('hidden');ui('pauseBtn').classList.add('hidden');ui('mobileControls').classList.add('hidden');ui('pauseMenu').classList.add('hidden');showScreen('screen-title')}

function drawBackground(stageKey){const s=STAGES[stageKey];const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,s.bg1);g.addColorStop(1,s.bg2);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 // parallax skyline
 ctx.globalAlpha=.18;ctx.fillStyle='#fff';for(let i=0;i<18;i++){const x=(i*93+40)%W,ht=60+(i*47)%180;ctx.fillRect(x,H-ht-110,48,ht)}ctx.globalAlpha=1;
 ctx.fillStyle='#ffffff09';for(let r=0;r<8;r++){ctx.beginPath();ctx.arc(W/2,H/2,100+r*90,0,Math.PI*2);ctx.strokeStyle='#ffffff08';ctx.lineWidth=2;ctx.stroke()}
}
function drawStage(stageKey){const s=STAGES[stageKey];for(const p of s.platforms){ctx.fillStyle=p.type==='solid'?'#101722':'#192434';roundRect(ctx,p.x,p.y,p.w,p.h,10,true,false);ctx.fillStyle='#ffffff22';ctx.fillRect(p.x+10,p.y+4,p.w-20,4);if(p.type==='solid'){ctx.fillStyle='#0008';for(let x=p.x+16;x<p.x+p.w-10;x+=34)ctx.fillRect(x,p.y+p.h,18,16)}}}
function drawProjectiles(){for(const p of state.projectiles){ctx.save();ctx.shadowBlur=22;ctx.shadowColor=p.color;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.w/2,0,Math.PI*2);ctx.fill();ctx.restore()}}
function drawEffects(){for(const e of state.effects){ctx.globalAlpha=clamp(e.life/e.max,0,1);ctx.fillStyle=e.color;ctx.fillRect(e.x,e.y,e.size,e.size);ctx.globalAlpha=1}}
function updateEffects(){for(let i=state.effects.length-1;i>=0;i--){const e=state.effects[i];e.x+=e.vx;e.y+=e.vy;e.vy+=.25;e.life--;if(e.life<=0)state.effects.splice(i,1)}}

function gameStep(){
 if(state.mode==='match'&&!state.paused){
   if(state.bannerFrames>0){state.bannerFrames--;if(state.bannerFrames===0)ui('matchBanner').classList.add('hidden')}
   if(state.countdown>0)state.countdown--;else if(!state.winner){
      state.time--;if(state.time<=0){state.time=0;const [a,b]=state.fighters;if(a.stocks!==b.stocks)state.winner=a.stocks>b.stocks?a:b;else state.winner=a.percent<=b.percent?a:b;showBanner(`${state.winner.def.name} WINS!`,180)}
      const [a,b]=state.fighters;updateAI(b,a);a.update(STAGES[state.stage]);b.update(STAGES[state.stage]);checkCombat();checkBlast();updateEffects();updateHud();
   } else {updateEffects()}
   if(state.winner&&state.countdown<=0&&state.bannerFrames<=0){quit()}
 }
 for(const k in pressed)delete pressed[k];
}
function render(){
 ctx.save();let sx=0,sy=0;if(state.shake>0){sx=rand(-state.shake,state.shake);sy=rand(-state.shake,state.shake);state.shake*=.82;if(state.shake<.3)state.shake=0}ctx.translate(sx,sy);
 drawBackground(state.stage||'summit');drawStage(state.stage||'summit');
 if(state.mode==='match'){drawProjectiles();for(const f of state.fighters)f.draw();drawEffects();const sec=Math.ceil(state.time/60),m=Math.floor(sec/60),s=String(sec%60).padStart(2,'0');ui('matchTimer').textContent=`${m}:${s}`}
 ctx.restore();
}
let last=performance.now(),acc=0;function loop(t){acc+=Math.min(50,t-last);last=t;while(acc>=1000/60){gameStep();acc-=1000/60}render();requestAnimationFrame(loop)}requestAnimationFrame(loop);

function buildMenus(){
 const fg=ui('fighterGrid');fighterOrder.forEach((k,i)=>{const f=FIGHTERS[k],d=document.createElement('div');d.className='fighterCard'+(k===state.p1?' selected':'');d.dataset.key=k;d.innerHTML=`<div class="fighterPortrait" style="background:linear-gradient(145deg,${f.color}33,#05070c);color:${f.color}">${f.name[0]}</div><div class="fighterMeta"><div class="fighterName">${f.name}</div><div class="fighterType">${f.type}</div></div>`;d.onclick=()=>{state.p1=k;document.querySelectorAll('.fighterCard').forEach(x=>x.classList.toggle('selected',x.dataset.key===k));ui('p1Readout').textContent='P1: '+f.name};fg.appendChild(d)});
 const sg=ui('stageGrid');stageOrder.forEach(k=>{const s=STAGES[k],d=document.createElement('div');d.className='stageCard'+(k===state.stage?' selected':'');d.dataset.key=k;d.innerHTML=`<div class="stagePreview" style="background:linear-gradient(${s.bg1},${s.bg2})"><div style="position:absolute;left:16%;right:16%;bottom:24px;height:14px;background:#101722;border-radius:8px"></div><div style="position:absolute;left:31%;width:22%;bottom:72px;height:8px;background:#26344a;border-radius:5px"></div><div style="position:absolute;right:31%;width:22%;bottom:72px;height:8px;background:#26344a;border-radius:5px"></div></div><div class="stageName">${s.name}</div>`;d.onclick=()=>{state.stage=k;document.querySelectorAll('.stageCard').forEach(x=>x.classList.toggle('selected',x.dataset.key===k))};sg.appendChild(d)});
}
buildMenus();
ui('playBtn').onclick=()=>{state.mode='select';showScreen('screen-select')};ui('controlsBtn').onclick=()=>showScreen('screen-controls');ui('closeControlsBtn').onclick=()=>showScreen('screen-title');ui('toStageBtn').onclick=()=>showScreen('screen-stage');ui('backSelectBtn').onclick=()=>showScreen('screen-select');ui('startMatchBtn').onclick=startMatch;ui('pauseBtn').onclick=togglePause;ui('resumeBtn').onclick=togglePause;ui('quitBtn').onclick=quit;

// Prevent gestures from stealing gameplay on iOS.
document.addEventListener('gesturestart',e=>e.preventDefault());
document.addEventListener('contextmenu',e=>e.preventDefault());
})();
