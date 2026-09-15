// 이 게임에만 나오는 문구. 기록 안내와 도구 이름은 shared/strings.js에 있다.
//
// **영어·스페인어 규칙에만 "Korean idioms"라고 적혀 있다.** 그 두 언어에는 네 글자
// 성어가 없어 한국어 사전을 쓰기 때문이다(`words.js`). 일본어·중국어는 제 나라
// 성어가 나오므로 나라 이름을 붙이지 않는다.
// **성어와 그 뜻은 여기에 없다** — 꼬들의 단어처럼 게임 내용 자체가 한국어라
// `words.js`에 한 벌만 있고, 옮기지 않는다.
(function () {
  SharedI18n.add({
    ko: {
      'meta.desc': '격자에 숨은 사자성어를 길로 이어 남김없이 찾는 퍼즐',
      'idioms.note': '{size}×{size}, 성어 {count}개.',
      'idioms.unknown': '사자성어가 아닙니다.',
      'idioms.taken': '이미 찾은 성어가 쓰고 있는 칸입니다.',
      'idioms.again': '한 판에 같은 성어를 두 번 쓸 수 없습니다.',
      'idioms.hintCleared': '어긋난 성어 {count}개를 걷어 냈습니다.',
      'idioms.rule1': '격자에 <b>사자성어</b>가 숨어 있습니다. 네 글자를 길로 이어 찾아냅니다.',
      'idioms.rule2': '길은 <b>위아래·양옆으로만</b> 꺾입니다. 대각선은 없습니다.',
      'idioms.rule3': '<b>어두운 칸을 뺀 모든 칸을 정확히 한 번씩</b> 씁니다. 남는 글자도, 두 성어가 나눠 쓰는 글자도 없습니다.',
      'idioms.rule4': '그래서 <b>맞는 성어인데 틀린 자리</b>가 있습니다. 하나를 잘못 놓으면 나머지가 막힙니다.',
      'idioms.rule5': '찾은 성어를 <b>톡 누르면</b> 지워집니다.',
      'idioms.rule6': '<b>이 게임의 모든 판은 덮는 방법이 하나뿐입니다.</b> 다 덮었다면 그게 정답입니다.',
      'idioms.rule7': '<b>흔히 쓰는 성어만</b> 나옵니다. 찾은 성어의 뜻은 판 아래에 차례로 쌓입니다.',
      'idioms.rule8': '<b>힌트</b>는 아직 못 찾은 성어 하나를 대신 놓아 줍니다. 힌트를 쓴 판은 최고 기록으로 남기지 않습니다.'
    },
    en: {
      'meta.desc': 'Trace the four-character Korean idioms hidden in the grid until every tile is used',
      'idioms.note': '{size}×{size}, {count} idioms.',
      'idioms.unknown': 'Not one of the idioms.',
      'idioms.taken': 'That tile already belongs to an idiom you found.',
      'idioms.again': 'The same idiom cannot be used twice on one board.',
      'idioms.hintCleared': 'Removed {count} misplaced idioms.',
      'idioms.rule1': 'Four-character Korean idioms (<b>사자성어</b>) are hidden in the grid. Trace four tiles to find one.',
      'idioms.rule2': 'A path turns <b>up, down, left and right only</b> — never diagonally.',
      'idioms.rule3': '<b>Every tile except the dark ones is used exactly once.</b> Nothing is left over, and no tile is shared by two idioms.',
      'idioms.rule4': 'So a <b>real idiom can still be in the wrong place</b>. One bad placement blocks the rest.',
      'idioms.rule5': '<b>Tap</b> an idiom you found to take it back.',
      'idioms.rule6': '<b>Every board here can be covered in exactly one way.</b> If you covered it, you solved it.',
      'idioms.rule7': 'Only <b>idioms in common use</b> appear. What each one means is listed under the board as you find it.',
      'idioms.rule8': 'A <b>hint</b> places one idiom you have not found yet. Boards solved with hints are not recorded.'
    },
    ja: {
      'meta.desc': '格子に隠れた四字熟語を道でつなぎ、すべてのマスを使い切るパズル',
      'idioms.note': '{size}×{size}、熟語 {count} 個。',
      'idioms.unknown': '四字熟語ではありません。',
      'idioms.taken': 'すでに見つけた熟語が使っているマスです。',
      'idioms.again': '同じ熟語を一つの盤で二度は使えません。',
      'idioms.hintCleared': 'ずれた熟語{count}個を取り除きました。',
      'idioms.rule1': '格子に<b>四字熟語</b>が隠れています。四マスを道でつないで見つけます。',
      'idioms.rule2': '道は<b>上下左右にだけ</b>曲がります。斜めはありません。',
      'idioms.rule3': '<b>暗いマスを除くすべてのマスをちょうど一度ずつ</b>使います。余るマスも、二つの熟語が分け合うマスもありません。',
      'idioms.rule4': 'だから<b>正しい熟語でも置き場所が違う</b>ことがあります。一つ間違えると残りが詰みます。',
      'idioms.rule5': '見つけた熟語は<b>軽く押す</b>と取り消せます。',
      'idioms.rule6': '<b>この盤はすべて覆い方がひとつだけです。</b>覆えたならそれが正解です。',
      'idioms.rule7': '<b>よく使う熟語だけ</b>が出ます。意味は見つけるたびに盤の下に並びます。',
      'idioms.rule8': '<b>ヒント</b>はまだ見つけていない熟語をひとつ置きます。ヒントを使った盤はベスト記録に残しません。'
    },
    'zh-CN': {
      'meta.desc': '把格子里藏着的四字成语连成路径，用尽每一格',
      'idioms.note': '{size}×{size}，成语 {count} 个。',
      'idioms.unknown': '不是四字成语。',
      'idioms.taken': '这一格已经属于找到的成语。',
      'idioms.again': '同一个成语在一盘里不能用两次。',
      'idioms.hintCleared': '清掉了 {count} 个放错的成语。',
      'idioms.rule1': '格子里藏着<b>四字成语</b>。把四格连成一条路径就找到一个。',
      'idioms.rule2': '路径只能<b>上下左右</b>拐弯，没有斜线。',
      'idioms.rule3': '<b>除深色格外，每一格都正好用一次。</b>不会剩下，也不会由两个成语共用。',
      'idioms.rule4': '所以<b>成语对了位置也可能错</b>。放错一个，其余就走不通。',
      'idioms.rule5': '<b>点一下</b>已找到的成语就能取消。',
      'idioms.rule6': '<b>这里每个盘面都只有一种覆盖方式。</b>覆盖完就是解开了。',
      'idioms.rule7': '只出<b>常用成语</b>。每找到一个，意思就列在盘面下方。',
      'idioms.rule8': '<b>提示</b>会替你放上一个还没找到的成语。用过提示的盘面不计入最好成绩。'
    },
    'zh-TW': {
      'meta.desc': '把格子裡藏著的四字成語連成路徑，用盡每一格',
      'idioms.note': '{size}×{size}，成語 {count} 個。',
      'idioms.unknown': '不是四字成語。',
      'idioms.taken': '這一格已經屬於找到的成語。',
      'idioms.again': '同一個成語在一盤裡不能用兩次。',
      'idioms.hintCleared': '清掉了 {count} 個放錯的成語。',
      'idioms.rule1': '格子裡藏著<b>四字成語</b>。把四格連成一條路徑就找到一個。',
      'idioms.rule2': '路徑只能<b>上下左右</b>轉彎，沒有斜線。',
      'idioms.rule3': '<b>除深色格外，每一格都正好用一次。</b>不會剩下，也不會由兩個成語共用。',
      'idioms.rule4': '所以<b>成語對了位置也可能錯</b>。放錯一個，其餘就走不通。',
      'idioms.rule5': '<b>點一下</b>已找到的成語就能取消。',
      'idioms.rule6': '<b>這裡每個盤面都只有一種覆蓋方式。</b>覆蓋完就是解開了。',
      'idioms.rule7': '只出<b>常用成語</b>。每找到一個，意思就列在盤面下方。',
      'idioms.rule8': '<b>提示</b>會替你放上一個還沒找到的成語。用過提示的盤面不計入最好成績。'
    },
    es: {
      'meta.desc': 'Traza los modismos coreanos de cuatro sílabas escondidos en la cuadrícula hasta usar todas las casillas',
      'idioms.note': '{size}×{size}, {count} modismos.',
      'idioms.unknown': 'No es uno de los modismos.',
      'idioms.taken': 'Esa casilla ya pertenece a un modismo que encontraste.',
      'idioms.again': 'El mismo modismo no puede usarse dos veces en un tablero.',
      'idioms.hintCleared': 'Quitó {count} modismos mal colocados.',
      'idioms.rule1': 'La cuadrícula esconde modismos coreanos de cuatro sílabas (<b>사자성어</b>). Traza cuatro casillas para encontrar uno.',
      'idioms.rule2': 'El trazo gira <b>solo en horizontal y vertical</b>, nunca en diagonal.',
      'idioms.rule3': '<b>Cada casilla, salvo las oscuras, se usa exactamente una vez.</b> No sobra ninguna ni se comparte entre dos modismos.',
      'idioms.rule4': 'Por eso <b>un modismo correcto puede estar en el sitio equivocado</b>. Uno mal puesto bloquea el resto.',
      'idioms.rule5': '<b>Toca</b> un modismo encontrado para deshacerlo.',
      'idioms.rule6': '<b>Todos los tableros aquí se cubren de una sola manera.</b> Si lo cubriste, lo resolviste.',
      'idioms.rule7': 'Solo aparecen <b>modismos de uso corriente</b>. Su significado se va listando bajo el tablero.',
      'idioms.rule8': 'Una <b>pista</b> coloca un modismo que aún no encontraste. Los tableros resueltos con pistas no se registran.'
    }
  });
})();
