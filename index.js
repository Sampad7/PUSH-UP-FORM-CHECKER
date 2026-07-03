import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startOverlay = document.getElementById('startOverlay');
const fileInput = document.getElementById('fileInput');
const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');
const errorMsg = document.getElementById('errorMsg');
const feedbackBanner = document.getElementById('feedbackBanner');
const repCountEl = document.getElementById('repCount');
const elbowAngleEl = document.getElementById('elbowAngle');
const goodRepsEl = document.getElementById('goodReps');
const badRepsEl = document.getElementById('badReps');
const summaryCard = document.getElementById('summaryCard');
const summaryText = document.getElementById('summaryText');
const issuesList = document.getElementById('issuesList');
const issuesEmpty = document.getElementById('issuesEmpty');

const dotDepth = document.getElementById('dot-depth');
const dotBack = document.getElementById('dot-back');
const dotLockout = document.getElementById('dot-lockout');
const rowDepth = document.getElementById('row-depth');
const rowBack = document.getElementById('row-back');
const rowLockout = document.getElementById('row-lockout');

let poseLandmarker = null;
let running = false;
let smoothedElbow = null;
let smoothedDevSigned = null;

let repState = 'top'; // 'top' | 'bottom'
let minElbowThisRep = 180;
let worstDeviationThisRep = 0;
let repCount = 0, goodReps = 0, badReps = 0;
let backOkNow = true;
let issues = [];
let lastLoggedAt = { sag:-99, pike:-99 };

const CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28]
];

function angleAt(a,b,c){
  const ab = {x:a.x-b.x,y:a.y-b.y};
  const cb = {x:c.x-b.x,y:c.y-b.y};
  const dot = ab.x*cb.x + ab.y*cb.y;
  const magA = Math.hypot(ab.x,ab.y);
  const magC = Math.hypot(cb.x,cb.y);
  if(magA===0||magC===0) return null;
  let cos = dot/(magA*magC);
  cos = Math.min(1,Math.max(-1,cos));
  return Math.acos(cos)*180/Math.PI;
}

function pickSide(lm){
  const leftVis = (lm[11]?.visibility||0)+(lm[13]?.visibility||0)+(lm[15]?.visibility||0)+(lm[23]?.visibility||0)+(lm[27]?.visibility||0);
  const rightVis = (lm[12]?.visibility||0)+(lm[14]?.visibility||0)+(lm[16]?.visibility||0)+(lm[24]?.visibility||0)+(lm[28]?.visibility||0);
  return rightVis >= leftVis ? {sh:12,el:14,wr:16,hip:24,ank:28} : {sh:11,el:13,wr:15,hip:23,ank:27};
}

function setBanner(text, level){
  feedbackBanner.textContent = text;
  feedbackBanner.classList.remove('good','warn','bad');
  if(level) feedbackBanner.classList.add(level);
}

function fmtTime(t){
  const m = Math.floor(t/60);
  const s = Math.floor(t%60).toString().padStart(2,'0');
  return m+':'+s;
}

function logIssue(kind, label, level){
  const t = video.currentTime;
  if(lastLoggedAt[kind] !== undefined && (t - lastLoggedAt[kind]) < 1.2) return;
  lastLoggedAt[kind] = t;
  issues.push({ time:t, label, level: level||'bad' });
  renderIssues();
}

function renderIssues(){
  if(issues.length===0){
    issuesEmpty.style.display = 'block';
    issuesList.innerHTML = '';
    return;
  }
  issuesEmpty.style.display = 'none';
  issuesList.innerHTML = issues.map((iss,idx)=>
    '<div class="issue-item' + (iss.level==='warn' ? ' warn-type' : '') + '" data-idx="' + idx + '">' +
      '<span class="t">' + fmtTime(iss.time) + '</span>' +
      '<span class="m">' + iss.label + '</span>' +
    '</div>'
  ).join('');
}

issuesList.addEventListener('click', (e)=>{
  const item = e.target.closest('.issue-item');
  if(!item) return;
  const idx = parseInt(item.dataset.idx,10);
  const iss = issues[idx];
  if(!iss) return;
  video.pause();
  video.currentTime = Math.max(0, iss.time - 0.15);
});

function setDot(dot,row,state){
  // state: null(neutral), true(good), false(bad)
  dot.classList.remove('good','bad');
  row.classList.remove('active');
  if(state===true){ dot.classList.add('good'); row.classList.add('active'); }
  else if(state===false){ dot.classList.add('bad'); row.classList.add('active'); }
}

async function initLandmarker(){
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions:{
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });
}

function setBannerLoading(){
  setBanner('Loading pose model…', null);
}

async function loadVideoFile(file){
  errorMsg.style.display = 'none';
  if(!file) return;
  if(!file.type.startsWith('video/')){
    errorMsg.style.display = 'block';
    errorMsg.textContent = 'That doesn\'t look like a video file. Please choose a video (mp4, mov, webm...).';
    return;
  }
  try{
    startOverlay.classList.add('hidden');
    resetSession();
    summaryCard.classList.remove('show');
    const url = URL.createObjectURL(file);
    video.src = url;
    video.controls = false;
    video.muted = false;
    video.loop = false;

    if(!poseLandmarker){
      setBannerLoading();
      await initLandmarker();
    }

    await new Promise((resolve,reject)=>{
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error('Could not read this video file.'));
    });

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    running = true;
    setBanner('Video loaded — press play', null);
    await video.play();
    requestAnimationFrame(loop);
  }catch(err){
    console.error(err);
    errorMsg.style.display = 'block';
    errorMsg.textContent = 'Could not load that video (' + (err.message || err) + '). Try a different file or format (mp4 works best).';
  }
}

function togglePlayPause(){
  if(!video.src) return;
  if(video.paused){ video.play(); } else { video.pause(); }
}

video.addEventListener('play', ()=>{
  if(!running){
    running = true;
    requestAnimationFrame(loop);
  }
});

video.addEventListener('ended', ()=>{
  running = false;
  const total = repCount;
  summaryText.innerHTML = 'Counted <b>' + total + '</b> reps — <b>' + goodReps + '</b> good, <b>' + badReps + '</b> needing work.';
  summaryCard.classList.add('show');
  setBanner('Video finished', null);
});

function resetSession(){
  repCount = 0; goodReps = 0; badReps = 0;
  repState = 'top'; minElbowThisRep = 180; worstDeviationThisRep = 0;
  repCountEl.textContent = '0';
  goodRepsEl.textContent = '0';
  badRepsEl.textContent = '0';
  issues = [];
  lastLoggedAt = { sag:-99, pike:-99 };
  renderIssues();
  setDot(dotDepth,rowDepth,null);
  setDot(dotBack,rowBack,null);
  setDot(dotLockout,rowLockout,null);
}

let lastTime = -1;

function loop(){
  if(!running) return;
  const now = performance.now();
  if(video.currentTime !== lastTime){
    lastTime = video.currentTime;
    const result = poseLandmarker.detectForVideo(video, now);
    processResult(result);
  }
  requestAnimationFrame(loop);
}

function drawCallout(x, y, text, color){
  ctx.font = "600 13px 'Oswald', sans-serif";
  const padX = 8, padY = 6;
  const textW = ctx.measureText(text).width;
  const boxW = textW + padX*2;
  const boxH = 24;
  const boxX = x - boxW/2;
  const boxY = y - 34 - boxH;

  // connecting line from box to joint
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x, boxY + boxH);
  ctx.stroke();

  // arrowhead at joint
  ctx.beginPath();
  ctx.moveTo(x, y - 2);
  ctx.lineTo(x - 5, y - 12);
  ctx.lineTo(x + 5, y - 12);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // label box
  ctx.fillStyle = 'rgba(18,20,15,0.9)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, boxY + boxH/2 + 1);
  ctx.textBaseline = 'alphabetic';
}

function processResult(result){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!result.landmarks || result.landmarks.length === 0){
    setBanner('Step into frame', 'warn');
    return;
  }
  const lm = result.landmarks[0];
  const side = pickSide(lm);
  const W = canvas.width, H = canvas.height;

  const px = i => ({x: lm[i].x*W, y: lm[i].y*H});

  // Elbow angle
  const rawElbow = angleAt(px(side.sh), px(side.el), px(side.wr));
  if(rawElbow!==null){
    smoothedElbow = smoothedElbow===null ? rawElbow : smoothedElbow*0.7 + rawElbow*0.3;
  }

  // Back straightness: signed deviation of hip from shoulder-ankle line
  const shP = px(side.sh), hipP = px(side.hip), ankP = px(side.ank);
  let devSigned = 0;
  if(Math.abs(ankP.x - shP.x) > 1e-3){
    const t = (hipP.x - shP.x) / (ankP.x - shP.x);
    const lineY = shP.y + (ankP.y - shP.y) * t;
    devSigned = (hipP.y - lineY) / H; // positive = hip sags below line
  }
  smoothedDevSigned = smoothedDevSigned===null ? devSigned : smoothedDevSigned*0.7 + devSigned*0.3;

  const DEV_THRESH = 0.055;
  const wasBackOk = backOkNow;
  backOkNow = Math.abs(smoothedDevSigned) < DEV_THRESH;
  if(wasBackOk && !backOkNow){
    if(smoothedDevSigned > 0) logIssue('sag', 'Hips sagging — brace your core', 'bad');
    else logIssue('pike', 'Hips piked up — flatten your line', 'bad');
  }

  // Draw skeleton
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,90,46,0.8)';
  CONNECTIONS.forEach(([a,b])=>{
    if(!lm[a]||!lm[b]) return;
    const pa = px(a), pb = px(b);
    ctx.beginPath();
    ctx.moveTo(pa.x,pa.y);
    ctx.lineTo(pb.x,pb.y);
    ctx.stroke();
  });
  [11,12,13,14,15,16,23,24,25,26,27,28].forEach(i=>{
    if(!lm[i]) return;
    const p = px(i);
    ctx.beginPath();
    ctx.arc(p.x,p.y,5,0,Math.PI*2);
    ctx.fillStyle = '#EDEDE6';
    ctx.fill();
  });
  // Reference line: ideal straight body line from shoulder to ankle
  ctx.setLineDash([6,6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(139,143,130,0.7)';
  ctx.beginPath();
  ctx.moveTo(shP.x, shP.y);
  ctx.lineTo(ankP.x, ankP.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Highlight hip in red/green based on back straightness
  const hipDraw = hipP;
  ctx.beginPath();
  ctx.arc(hipDraw.x, hipDraw.y, 8, 0, Math.PI*2);
  ctx.fillStyle = backOkNow ? '#7FD858' : '#FF5A5A';
  ctx.fill();

  // Callout label pointing at the hip when back form breaks down
  if(!backOkNow){
    const msg = smoothedDevSigned > 0 ? 'HIPS SAGGING' : 'HIPS PIKED';
    drawCallout(hipDraw.x, hipDraw.y, msg, '#FF5A5A');
  }

  // Elbow angle readout, colored to match current depth progress
  const elP = px(side.el);
  const elColor = repState==='bottom' && smoothedElbow < 95 ? '#7FD858' : '#EDEDE6';
  ctx.font = "600 15px 'Oswald', sans-serif";
  ctx.fillStyle = elColor;
  ctx.textAlign = 'left';
  ctx.fillText(Math.round(rawElbow!==null ? smoothedElbow : 0) + '°', elP.x + 12, elP.y + 4);

  if(smoothedElbow===null) return;
  elbowAngleEl.textContent = Math.round(smoothedElbow)+'°';

  // Rep state machine
  if(repState==='top'){
    setDot(dotBack,rowBack, backOkNow);
    if(!backOkNow){
      setBanner(smoothedDevSigned>0 ? 'Raise your hips — back is sagging' : 'Lower your hips — piking up', 'bad');
    } else if(smoothedElbow < 140){
      setBanner('Lowering…', null);
    } else {
      setBanner('Ready — lower down', null);
    }
    if(smoothedElbow < 100){
      repState = 'bottom';
      minElbowThisRep = smoothedElbow;
      worstDeviationThisRep = Math.abs(smoothedDevSigned);
    }
  } else if(repState==='bottom'){
    minElbowThisRep = Math.min(minElbowThisRep, smoothedElbow);
    worstDeviationThisRep = Math.max(worstDeviationThisRep, Math.abs(smoothedDevSigned));
    setDot(dotDepth,rowDepth, minElbowThisRep < 95);
    setDot(dotBack,rowBack, worstDeviationThisRep < DEV_THRESH);
    if(!backOkNow){
      setBanner(smoothedDevSigned>0 ? 'Raise your hips — back is sagging' : 'Lower your hips — piking up', 'bad');
    } else {
      setBanner('Push up', null);
    }
    if(smoothedElbow > 155){
      repState = 'top';
      repCount++;
      repCountEl.textContent = repCount;
      const depthOk = minElbowThisRep < 95;
      const backOk = worstDeviationThisRep < DEV_THRESH;
      setDot(dotLockout,rowLockout, true);
      if(depthOk && backOk){
        goodReps++; goodRepsEl.textContent = goodReps;
        setBanner('Good rep!', 'good');
      } else {
        badReps++; badRepsEl.textContent = badReps;
        const reason = !depthOk ? 'Go deeper — bend elbows past 90°' : 'Keep hips in line next time';
        setBanner(reason, 'warn');
        if(!depthOk) logIssue('depth'+repCount, 'Rep ' + repCount + ': only reached ' + Math.round(minElbowThisRep) + '° — not deep enough', 'warn');
      }
      minElbowThisRep = 180;
      worstDeviationThisRep = 0;
      setDot(dotDepth,rowDepth,null);
    }
  }
}

fileInput.addEventListener('change', (e)=>{
  const file = e.target.files && e.target.files[0];
  if(file) loadVideoFile(file);
});
playPauseBtn.addEventListener('click', togglePlayPause);
resetBtn.addEventListener('click', ()=>{
  resetSession();
  summaryCard.classList.remove('show');
});

window.addEventListener('resize', ()=>{
  if(video.videoWidth){
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
});