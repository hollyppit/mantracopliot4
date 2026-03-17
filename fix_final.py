import io
import os

t_path = r'e:\만트라 스튜디오 운영\앱 개발 소스\만트라 코파일럿_프로토타입\temp_full.txt'
i_path = r'e:\만트라 스튜디오 운영\앱 개발 소스\만트라 코파일럿_프로토타입\index.html'

with io.open(t_path, 'r', encoding='utf-8') as f:
    lines = f.read()

fixed_steps = """  { id:'s-price', visual:'💰', stageIntro:null, question:'스토어 판매 가격을 설정해주세요.', example:'예시: 1500원 정도로 가볍게 책정, 4900원(프리미엄)', choices:['무료 배포','990원','2,900원','4,900원'], fieldId:'s-price' }
];

"""

core_funcs = """
function $(id){ return document.getElementById(id); }

function sceneTransition(newBgClass, cb) {
  const overlay = $('sceneOverlay');
  overlay.classList.add('fade-in');
  setTimeout(() => {
    const bg = $('sceneBg');
    bg.className = 'scene-bg ' + newBgClass;
    overlay.classList.remove('fade-in');
    overlay.classList.add('fade-out');
    setTimeout(() => { overlay.className = ''; cb && cb(); }, 600);
  }, 600);
}

function markdownToHtml(text) {
  return text
    .replace(/\\*\\*(.+?)\\*\\*/g, '<strong style="color:#c4b5fd;">$1</strong>')
    .replace(/^#{1,3}\\s(.+)$/gm, '<span style="font-weight:800;font-size:1.05em;">$1</span>')
    .replace(/^\\* (.+)$/gm, '• $1')
    .replace(/\\n/g, '<br>');
}

function showDialogText(step, cb) {
  if (typing) return;
  typing = true;
  const txtField = $('dialogTxt');
  const exField = $('dialogExample');
  
  txtField.innerHTML = '';
  exField.innerHTML = '';
  exField.classList.remove('show');
  $('dialogCursor').style.display = 'none';
  $('choicesBox').innerHTML = '';
  $('choicesBox').classList.remove('show');

  const text = typeof step === 'string' ? step : step.question;
  const example = typeof step === 'object' ? step.example : null;

  const htmlContent = markdownToHtml(text);
  
  txtField.style.opacity = '0';
  txtField.innerHTML = htmlContent;
  txtField.scrollTop = 0;

  setTimeout(() => {
    txtField.style.transition = 'opacity 0.4s ease';
    txtField.style.opacity = '1';
    typing = false;
    if (example) {
      exField.innerHTML = '<span>Tip!</span> ' + example;
      exField.classList.add('show');
    }
    if (cb) cb();
  }, 200);
}

function setStageBanner(text) {
  const banner = $('stageBanner');
  if (text) {
    let htmlText = text.replace(/\\n/g, '<br>');
    $('stageBannerText').innerHTML = htmlText;
    banner.classList.toggle('seller-banner', isSeller);
    banner.style.display = 'block';
    setTimeout(() => banner.classList.add('show'), 50);
  } else {
    banner.classList.remove('show');
    setTimeout(() => banner.style.display = 'none', 500);
  }
}

function showChoices(choices, customHandler) {
  const box = $('choicesBox');
  box.innerHTML = '';
  if (!choices || !choices.length) {
    box.style.display = 'none';
    return;
  }
  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn' + (isSeller ? ' seller-btn' : '');
    btn.textContent = c;
    btn.onclick = () => {
      if (customHandler) customHandler(c);
      else handleChoice(c);
    };
    box.appendChild(btn);
  });
  box.style.display = 'flex';
}

function showInput(hideInputBar = false) {
  const area = $('answerArea');
  if (area) area.classList.add('show');
  
  const insightBtn = $('solutionBarBtn');
  if (insightBtn) {
    insightBtn.className = 'insight-bar-btn' + (isSeller ? ' seller-bar-btn' : '');
    insightBtn.style.display = (currentStep === 999 || hideInputBar) ? 'none' : 'flex';
  }

  const inputWrapper = $('inputWrapper');
  if (inputWrapper) inputWrapper.style.display = hideInputBar ? 'none' : 'flex';
}

const ACT_MAP = {
  desire: ['l-1','l-2','l-3','l-3b','l-3c','l-4','l-5','l-6','l-7'],
  conflict: ['l-8','l-9','l-10','l-11','l-12','l-13','l-14','l-15'],
  overcome: ['l-16','l-17','l-18','l-19','l-20']
};
"""

s_point = "fieldId:'s-desc' },"
idx = lines.find(s_point)
f_start = "async function fetchAIFeedback(userInput, stepInfo) {"
idx2 = lines.find(f_start)

if idx != -1 and idx2 != -1:
    content = lines[:idx+len(s_point)] + '\n' + fixed_steps + core_funcs + lines[idx2:]
    
    # Final cleanup of any potential trailing garbage if tags are missing
    if '</html>' not in content[-100:]:
        if '</script>' not in content[-100:]:
            content += '\n</script>'
        if '</body>' not in content[-100:]:
            content += '\n</body>'
        if '</html>' not in content[-100:]:
            content += '\n</html>'
            
    with io.open(i_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Success')
else:
    print('Split points not found: s_desc={} fetch={}'.format(idx, idx2))
