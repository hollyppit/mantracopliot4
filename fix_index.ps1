$rawPath = "e:\만트라 스튜디오 운영\앱 개발 소스\만트라 코파일럿_프로토타입\index.html"
$path = Resolve-Path $rawPath
try {
    $lines = [System.IO.File]::ReadAllLines($path.ProviderPath, [System.Text.Encoding]::UTF8)
} catch {
    Write-Error "Failed to read file: $_"
    exit 1
}

$newLines = New-Object System.Collections.Generic.List[string]

# Part 1: Start to line 1802
for ($i = 0; $i -lt 1802 -and $i -lt $lines.Count; $i++) { $newLines.Add($lines[$i]) }

# ACT_MAP definition
$newLines.Add("const ACT_MAP = {")
$newLines.Add("  desire: ['l-1','l-2','l-3','l-3b','l-3c','l-4','l-5','l-6'],")
$newLines.Add("  conflict: ['l-7','l-8','l-9','l-10','l-11','l-12','l-13','l-14'],")
$newLines.Add("  overcome: ['l-15','l-16','l-17','l-18','l-19','l-20']")
$newLines.Add("};")
$newLines.Add("let isSeller = false;")

# Part 2: Lines 1804 up to 1889
for ($i = 1803; $i -lt 1889 -and $i -lt $lines.Count; $i++) { $newLines.Add($lines[$i]) }

# New SellerSteps and Logic
$repl = @"
const sellerSteps = [
  { id:'s-name',  visual:'🏷️', stageIntro:'이 단계에서는 루틴 이름과 기본 정보를 설정합니다.\n구매자가 한눈에 이해할 수 있는 매력적인 이름이 좋습니다.', question:'루틴의 이름을 정해주세요.', example:'예시: 10일 완성 로판 기획 루틴, 캐릭터 빌드업 마스터, 지역 조사 7단계', choices:['10일 기획 챌린지', '캐릭터 빌드업 루틴', '지역 조사 메이커'], fieldId:'s-name' },
  { id:'s-genre', visual:'🎭', stageIntro:null, question:'이 루틴은 어떤 장르에 적합한 기획을 도와주나요?', example:'예시: 로맨스 코미디, 빙의물, 모든 장르 범용', choices:['로맨스 판타지','정통 판타지','현대물','장르 무관 범용'], fieldId:'s-genre' },
  { id:'s-steps', visual:'📊', stageIntro:null, question:'루틴을 몇 단계로 구성하시겠어요?', example:'예시: 5단계(단편), 10단계(중편), 자동 추천', choices:['5단계 (빠른 단편 기획)','10단계 (심도 진행)','15단계 이상 (장화 기획)'], fieldId:'s-steps' },
  { id:'s-q1',    visual:'❓', stageIntro:'여기는 루틴의 첫 번째 질문 단계입니다.\n창작자들이 몰입할 매력적인 질문을 작성해주세요.', question:'작가님만의 첫 번째 기획 질문은 무엇인가요?', example:'예시: 주인공이 가장 아끼는 보물과 그 이유는 무엇인가요?', choices:['주인공이 가장 아끼는 보물은?', '주인공의 가장 큰 결핍은?', '이야기의 시작을 알리는 발단 사건은?'], fieldId:'s-q1' },
  { id:'s-q1c',   visual:'📝', stageIntro:null, question:'이 질문에 제안할 선택지를 추가하시겠어요?', example:'예시: [신분 위조], [과거의 연인], [금지된 사랑] 같은 선택지를 주고 싶어', choices:['미리 세팅해 주신 선택지 제공','자유 입력 형태로만 진행'], fieldId:'s-q1c' },
  { id:'s-desc',  visual:'📢', stageIntro:'이 단계에서는 마켓을 위한 상품 소개를 작성합니다.', question:'루틴을 홍보하기 위한 소개 문구를 작성해주세요.', example:'예시: 플롯이 막힌 작가님을 위한 가장 완벽한 10단계 가이드', choices:['막힌 플롯을 한숨에 풀어주는 마법의 기획서', '누구나 쉽게 따라하는 베스트셀러의 비결', '캐릭터가 스스로 움직이게 만드는 마법의 루틴'], fieldId:'s-desc' },
  { id:'s-price', visual:'💰', stageIntro:null, question:'스토어 판매 가격을 설정해주세요.', example:'예시: 1500원(가볍게 책정), 4900원(프리미엄)', choices:['무료 배포','990원','2,900원','4,900원'], fieldId:'s-price' }
];

async function fetchAIFeedback(userInput, stepInfo) {
  const endpoint = \`/api/chat\`;
  const projectContext = _currentLoadedProject || { title: "새 작품", answerHistory: answerHistory };
  
  let persona = "당신은 작품 기획을 돕는 유능한 AI 조수입니다.";
  
  if (selectedCharName && selectedCharName.includes('조수 B')) {
    persona = "당신은 웹소설 기획 조수 'B(F형)'입니다.";
  } else if (selectedCharName === '설정학 전문가') {
    persona = "당신은 가상세계 설정 전문가입니다.";
  } else if (selectedCharName === '냉정한 편집자') {
    persona = "당신은 10년 경력의 웹툰/웹소설 편집자입니다.";
  }

  const isRequestingRecommendation = userInput.includes('추천') || userInput.includes('모르겠');
  const storyContext = answerHistory.map(h => {
    const s = activeSteps.find(st => st.id === h.stepId);
    return s ? \`- \${s.fieldId ? s.fieldId.replace(/^[fsl]-/,'') : s.id}: \${h.boardValue || h.value}\` : '';
  }).filter(Boolean).join('\\n');
  
  let promptText = \`[현재 기획 단계]: \${stepInfo.question}\\n[작가의 입력]: \${userInput}\\n\${storyContext ? "\\n[이미 수집된 정보]:\\n" + storyContext : ""}\\n\\n[BOARD]: 전체 스토리를 통합한 한 문장을 추가하세요.\`;

  try {
    const response = await fetch('/api/chat', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: 'system', content: persona }, { role: 'user', content: promptText }],
        projectContext: projectContext
      })
    });
    if (response.ok) {
      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || '답변을 받지 못했습니다.';
    }
    return \`⚠️ 서버 오류 (\${response.status})\`;
  } catch (err) {
    return \`⚠️ 네트워크 오류: \${err.message}\`;
  }
}

async function processUserAnswer(val) {
  hideInput();
  showReplyFlash(val);
  const stepInfo = currentStep === 999 ? { id: 'verify-mode', question: '작품 검토 Q&A' } : activeSteps[currentStep];
  $('dialogTxt').innerHTML = '<span style="color:var(--text-dim);">(처리 중...)</span>';
  
  const feedback = await fetchAIFeedback(val, stepInfo);
  const boardMatch = feedback.match(/(\\[BOARD\\]:)\\s*([\\s\\S]+?)(?:\\n|\$)/i);
  const boardSummary = boardMatch ? boardMatch[2].trim() : val;
  const visibleFeedback = feedback.replace(/(\\[BOARD\\]:)[\\s\\S]*/i, '').trim();

  if (currentStep !== 999) {
    updateStorySentence(boardSummary, stepInfo.id);
    answerHistory.push({ stepIdx: currentStep, stepId: stepInfo.id, value: val, boardValue: boardSummary });
    setTimeout(() => runStep(currentStep + 1), 800);
  } else {
    showDialogText({ question: visibleFeedback }, () => showInput(false));
  }
}

function handleChoice(val) { processUserAnswer(val); }
function handleSend() {
  const box = $('inputBox');
  const val = box.value.trim();
  if (!val) return;
  box.value = '';
  processUserAnswer(val);
}
function hideInput() {
  $('answerArea').classList.remove('show');
  $('choicesBox').innerHTML = '';
  $('choicesBox').style.display = 'none';
}
function showReplyFlash(text) {
  const el = $(\'replyFlash\');
  if (!el) return;
  el.textContent = text.substring(0, 40);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}
"@

$newLines.Add($repl)

# Part 3: Lines from 2253 onwards
for ($i = 2252; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "</script>") {
        $newLines.Add($lines[$i])
        break
    }
    $newLines.Add($lines[$i])
}

# The script might be truncated in the original, let's ensure body/html tags are there
if ($newLines.Count -gt 0 -and $newLines[$newLines.Count-1] -notmatch "</html>") {
    if ($newLines[$newLines.Count-1] -notmatch "</script>") { $newLines.Add("</script>") }
    $newLines.Add("</body>")
    $newLines.Add("</html>")
}

[System.IO.File]::WriteAllLines($path.ProviderPath, $newLines.ToArray(), [System.Text.Encoding]::UTF8)
Write-Host "Success: index.html restored."
