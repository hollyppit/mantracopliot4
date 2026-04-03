import io
import os

t_path = 'temp_full.txt'
i_path = 'index.html'

def fix():
    try:
        # Read as bytes
        with open(t_path, 'rb') as f:
            data = f.read()
        print("Read {} bytes from {}".format(len(data), t_path))

        # Split points as bytes
        s_point = b"fieldId:'s-desc' },"
        idx1 = data.find(s_point)
        
        f_start = b"async function fetchAIFeedback"
        idx2 = data.find(f_start)
        
        if idx1 == -1 or idx2 == -1:
            print("Failed to find bytes: idx1={} idx2={}".format(idx1, idx2))
            return

        # Core code as bytes (encode as utf-8)
        fixed_steps = """  { id:'s-price', visual:'💰', stageIntro:null, question:'스토어 판매 가격을 설정해주세요.', example:'예시: 1500원 정도로 가볍게 책정, 4900원(프리미엄)', choices:['무료 배포','990원','2,900원','4,900원'], fieldId:'s-price' }
];

""".encode('utf-8')

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
""".encode('utf-8')

        # Combine
        combined = data[:idx1+len(s_point)] + b'\n' + fixed_steps + core_funcs + data[idx2:]
        
        # Closing tags check (as bytes)
        if b'</html>' not in combined[-200:]:
            if b'</script>' not in combined[-200:]:
                combined += b'\n</script>'
            if b'</body>' not in combined[-200:]:
                combined += b'\n</body>'
            if b'</html>' not in combined[-200:]:
                combined += b'\n</html>'

        # Write
        with open(i_path, 'wb') as f:
            f.write(combined)
        print("Success: Final index.html reconstructed via bytes.")

    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    fix()
