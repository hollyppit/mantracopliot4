import os

index_path = r"e:\만트라 스튜디오 운영\앱 개발 소스\만트라 코파일럿_프로토타입\index.html"
temp_path = r"e:\만트라 스튜디오 운영\앱 개발 소스\만트라 코파일럿_프로토타입\temp_full.txt"

# 1. Read the "Board UI" version (corrupted)
with open(temp_path, "r", encoding="utf-8") as f:
    temp_lines = f.readlines()

# 2. Identify the garbage section in temp_full.txt
# Garbage starts at line 1903 (index 1902)
# And ends where fetchAIFeedback starts (line 1971, index 1970)

# 3. Create fixed core functions block
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
      exField.innerHTML = `<span>Tip!</span> ${example}`;
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
    btn.className = `choice-btn${isSeller?' seller-btn':''}`;
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
    insightBtn.className = `insight-bar-btn${isSeller ? ' seller-bar-btn' : ''}`;
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

fixed_seller_steps_end = """  { id:'s-price', visual:'💰', stageIntro:null, question:'스토어 판매 가격을 설정해주세요.', example:'예시: 1500원 정도로 가볍게 책정, 4900원(프리미엄)', choices:['무료 배포','990원','2,900원','4,900원'], fieldId:'s-price' }
];

"""

# Reconstruct
new_lines = []

# Section 1: Up to line 1395 (where sellerSteps ends its last healthy object)
# Wait, let's be more precise. Line 1902 in temp_full.txt is:
# 1902:   { id:'s-desc',  visual:'📝', stageIntro:'이 단계에서는 마켓을 위한 상품 소개를 작성합니다.', question:'루틴을 홍보할 한 줄 소개 문구를 작성해주세요.', example:'예시: 플롯이 막힌 작가님을 위한 가장 완벽한 10단계 솔루션!', choices:['막힌 플롯을 단숨에 뚫어주는 마법의 기획법', '누구나 쉽게 따라하는 베스트셀러의 비밀', '캐릭터가 스스로 움직이게 만드는 마법의 루틴'], fieldId:'s-desc' },
new_lines.extend(temp_lines[:1902])

# Section 2: Fixed sellerSteps end
new_lines.append(fixed_seller_steps_end)

# Section 3: Core Functions Injection
# I'll find where // ── HELPERS ── was (approx line 1399 in restored file, but let's just prepend it to fetchAIFeedback)
new_lines.append(core_funcs)

# Section 4: Rest of the file from fetchAIFeedback (line 1971 in temp_full.txt)
new_lines.extend(temp_lines[1970:])

# Final check for closing tags
last_few = "".join(new_lines[-5:])
if "</html>" not in last_few:
    if "</script>" not in last_few:
        new_lines.append("</script>\n")
    if "</body>" not in last_few:
        new_lines.append("</body>\n")
    new_lines.append("</html>\n")

# Write
with open(index_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Success")
