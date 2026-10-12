/* 질문 은행: API 키 없이도 면접을 진행할 수 있도록 기본 질문을 담아 둔다. */
(function (root) {
  const OPENER = '먼저 1분 정도로 자기소개 부탁드립니다.';

  const COMMON = [
    '우리 회사(기관)에 지원하신 동기가 무엇인가요?',
    '본인의 가장 큰 강점과 약점을 하나씩 말씀해 주세요.',
    '팀에서 의견 충돌이 있었던 경험과, 그때 어떻게 해결했는지 말씀해 주세요.',
    '가장 크게 실패했던 경험은 무엇이고, 거기서 무엇을 배웠나요?',
    '스트레스를 받을 때 본인만의 해소 방법이 있나요?',
    '입사 후 5년 뒤 본인의 모습을 그려 본다면 어떤가요?',
    '최근에 관심 있게 본 뉴스나 이슈가 있다면 말씀해 주세요.',
    '주변 사람들은 당신을 어떤 사람이라고 평가하나요?',
    '원칙과 융통성 중 무엇이 더 중요하다고 생각하나요? 이유와 함께 말씀해 주세요.',
  ];

  const PRESSURE = [
    '방금 답변은 다른 지원자들과 크게 다르지 않은데, 본인만의 차별점은 무엇인가요?',
    '솔직히 이 직무에 경력이 부족해 보이는데, 왜 우리가 당신을 뽑아야 하죠?',
    '만약 이번에 떨어진다면 어떻게 하시겠어요?',
    '상사가 부당한 지시를 내린다면 어떻게 대응하시겠습니까?',
    '자기소개서에 쓴 내용이 너무 무난한데, 정말 본인 이야기가 맞나요?',
    '지금까지 답변 중 스스로 가장 아쉬웠던 답은 무엇이었나요?',
  ];

  const FIELDS = {
    general: {
      icon: '💼',
      label: '일반 기업 (사무/경영지원)',
      questions: [
        '엑셀이나 문서 작업 등 실무 역량을 보여줄 수 있는 경험이 있나요?',
        '여러 업무가 동시에 몰렸을 때 우선순위를 어떻게 정하나요?',
        '고객이나 타 부서와 협업하며 성과를 냈던 사례를 말씀해 주세요.',
        '우리 회사의 주력 사업에 대해 아는 대로 말씀해 주세요.',
        '업무를 개선해 본 경험이 있다면 구체적으로 설명해 주세요.',
      ],
    },
    it: {
      icon: '💻',
      label: 'IT / 개발',
      questions: [
        '가장 자신 있는 프로젝트를 하나 골라 본인 역할과 기술적 의사결정을 설명해 주세요.',
        '디버깅하기 가장 어려웠던 버그와 해결 과정을 말씀해 주세요.',
        '코드 리뷰에서 의견이 갈렸을 때 어떻게 합의했나요?',
        '새로운 기술을 학습할 때 본인만의 방법이 있나요?',
        '성능 문제를 발견하고 개선한 경험이 있다면 수치와 함께 설명해 주세요.',
      ],
    },
    public: {
      icon: '🏛️',
      label: '공무원 / 공기업',
      questions: [
        '공직자(공공기관 직원)에게 가장 중요한 덕목은 무엇이라고 생각하나요?',
        '민원인이 무리한 요구를 하며 화를 낸다면 어떻게 응대하시겠습니까?',
        '우리 기관의 주요 사업 중 개선이 필요하다고 생각하는 부분이 있나요?',
        '공익과 개인의 이익이 충돌하는 상황을 겪어 본 적이 있나요?',
        '규정에 없는 상황이 생겼을 때 어떻게 판단하시겠습니까?',
      ],
    },
    broadcast: {
      icon: '🎙️',
      label: '아나운서 / 방송',
      questions: [
        '본인이 생각하는 좋은 아나운서(방송인)의 조건은 무엇인가요?',
        '생방송 중 원고가 사라지거나 돌발 상황이 생기면 어떻게 대처하시겠습니까?',
        '최근 방송에서 인상 깊었던 진행자와 그 이유를 말씀해 주세요.',
        '우리 방송사의 프로그램 중 하나를 골라 개선점을 제안해 주세요.',
        '오늘 아침 주요 뉴스 하나를 30초 안에 전달해 보세요.',
        '본인의 목소리와 발음의 장점, 그리고 보완하고 있는 점은 무엇인가요?',
      ],
    },
    sales: {
      icon: '🤝',
      label: '영업 / 서비스',
      questions: [
        '처음 보는 사람을 설득해 본 경험을 말씀해 주세요.',
        '실적 목표를 달성하지 못할 것 같을 때 어떻게 하시겠습니까?',
        '불만 고객을 단골로 만든 경험이 있나요?',
        '지금 제 앞에 있는 이 펜을 저에게 팔아 보세요.',
        '거절당했을 때 어떻게 마음을 다잡나요?',
      ],
    },
    university: {
      icon: '🎓',
      label: '대학 입시 / 편입',
      questions: [
        '이 학과에 지원하게 된 계기는 무엇인가요?',
        '학교생활 중 가장 열정적으로 참여한 활동은 무엇인가요?',
        '전공과 관련해서 최근 읽은 책이나 자료가 있나요?',
        '입학 후 학업 계획과 졸업 후 진로를 말씀해 주세요.',
        '본인의 학업 역량을 보여줄 수 있는 경험을 말씀해 주세요.',
      ],
    },
  };

  const CLOSER = '마지막으로 하고 싶은 말이 있다면 해 주세요.';

  function shuffle(list, rand) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /**
   * 설정에 맞춰 질문 목록을 만든다. 첫 질문은 항상 자기소개, 마지막은 마무리 질문.
   * mode: 'personality' | 'job' | 'mixed' | 'pressure'
   */
  function buildQuestionSet({ field, mode, count, rand = Math.random }) {
    const job = (FIELDS[field] || FIELDS.general).questions;
    let pool;
    if (mode === 'personality') pool = shuffle(COMMON, rand);
    else if (mode === 'job') pool = shuffle(job, rand).concat(shuffle(COMMON, rand));
    else if (mode === 'pressure') pool = shuffle(PRESSURE, rand).concat(shuffle(job, rand));
    else {
      // 종합: 직무와 인성을 번갈아 섞는다
      const a = shuffle(job, rand);
      const b = shuffle(COMMON, rand);
      pool = [];
      while (a.length || b.length) {
        if (a.length) pool.push(a.shift());
        if (b.length) pool.push(b.shift());
      }
    }
    const middle = Math.max(0, count - 2);
    const picked = [OPENER].concat(pool.slice(0, middle));
    if (count >= 2) picked.push(CLOSER);
    return picked.slice(0, count);
  }

  const api = { OPENER, CLOSER, COMMON, PRESSURE, FIELDS, buildQuestionSet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Questions = api;
})(typeof window !== 'undefined' ? window : globalThis);
