$tempPath = "e:\만트라 스튜디오 운영\앱 개발 소스\만트라 코파일럿_프로토타입\temp_full.txt"
$indexPath = "e:\만트라 스튜디오 운영\앱 개발 소스\만트라 코파일럿_프로토타입\index.html"

# Use legacy-friendly way to read the whole file as a string
$lines = (Get-Content -Path $tempPath -Encoding UTF8) -join "`r`n"

# replacement blocks
$fixedSellerStepsEnd = @"
  { id:'s-price', visual:'💰', stageIntro:null, question:'스토어 판매 가격을 설정해주세요.', example:'예시: 1500원 정도로 가볍게 책정, 4900원(프리미엄)', choices:['무료 배포','990원','2,900원','4,900원'], fieldId:'s-price' }
];

"@

$coreFuncs = @"

function `$(id){ return document.getElementById(id); }

function sceneTransition(newBgClass, cb) {
  const overlay = `$('sceneOverlay');
  overlay.classList.add('fade-in');
  setTimeout(() => {
    const bg = `$('sceneBg');
    bg.className = 'scene-bg ' + newBgClass;
    overlay.classList.remove('fade-in');
    overlay.classList.add('fade-out');
    setTimeout(() => { overlay.className = ''; cb && cb(); }, 600);
  }, 600);
}

function markdownToHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#c4b5fd;">$1</strong>')
    .replace(/^#{1,3}\s(.+)$/gm, '<span style="font-weight:800;font-size:1.05em;">$1</span>')
    .replace(/^\* (.+)$/gm, '• $1')
    .replace(/\n/g, '<br>');
}

function showDialogText(step, cb) {
  if (typing) return;
  typing = true;
  const txtField = `$('dialogTxt');
  const exField = `$('dialogExample');
  
  txtField.innerHTML = '';
  exField.innerHTML = '';
  exField.classList.remove('show');
  `$('dialogCursor').style.display = 'none';
  `$('choicesBox').innerHTML = '';
  `$('choicesBox').classList.remove('show');

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
  const banner = `$('stageBanner');
  if (text) {
    let htmlText = text.replace(/\n/g, '<br>');
    `$('stageBannerText').innerHTML = htmlText;
    banner.classList.toggle('seller-banner', isSeller);
    banner.style.display = 'block';
    setTimeout(() => banner.classList.add('show'), 50);
  } else {
    banner.classList.remove('show');
    setTimeout(() => banner.style.display = 'none', 500);
  }
}

function showChoices(choices, customHandler) {
  const box = `$('choicesBox');
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
  const area = `$('answerArea');
  if (area) area.classList.add('show');
  
  const insightBtn = `$('solutionBarBtn');
  if (insightBtn) {
    insightBtn.className = 'insight-bar-btn' + (isSeller ? ' seller-bar-btn' : '');
    insightBtn.style.display = (currentStep === 999 || hideInputBar) ? 'none' : 'flex';
  }

  const inputWrapper = `$('inputWrapper');
  if (inputWrapper) inputWrapper.style.display = hideInputBar ? 'none' : 'flex';
}

const ACT_MAP = {
  desire: ['l-1','l-2','l-3','l-3b','l-3c','l-4','l-5','l-6','l-7'],
  conflict: ['l-8','l-9','l-10','l-11','l-12','l-13','l-14','l-15'],
  overcome: ['l-16','l-17','l-18','l-19','l-20']
};

"@

# Split and reconstruct
$splitPoint = "fieldId:'s-desc' },"
$idx = $lines.IndexOf($splitPoint)

if ($idx -ge 0) {
    $p1 = $lines.Substring(0, $idx + $splitPoint.Length)
    
    $fetchStart = "async function fetchAIFeedback(userInput, stepInfo) {"
    $idx2 = $lines.IndexOf($fetchStart)
    
    if ($idx2 -ge 0) {
        $p2 = $lines.Substring($idx2)
        
        $finalContent = $p1 + "`r`n" + $fixedSellerStepsEnd + $coreFuncs + $p2
        
        # Ensure closing tags
        if ($finalContent -notlike "*</html>*") {
            if ($finalContent -notlike "*</script>*") { $finalContent += "`r`n</script>" }
            if ($finalContent -notlike "*</body>*") { $finalContent += "`r`n</body>" }
            $finalContent += "`r`n</html>"
        }
        
        Set-Content -Path $indexPath -Value $finalContent -Encoding UTF8
        Write-Host "Success"
    } else {
        Write-Error "Could not find fetchAIFeedback start"
    }
} else {
    Write-Error "Could not find split point"
}
