import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { PageScaffold } from '../../components/page/PageScaffold';
import '../../styles/static-pages.css';

type AboutTab = 'developer' | 'jshsus';

function Featurette({
  children,
  imageAlt,
  imageSrc,
  reverse = false,
  title,
}: {
  children: ReactNode;
  imageAlt: string;
  imageSrc: string;
  reverse?: boolean;
  title: ReactNode;
}) {
  return (
    <div className={`about-featurette${reverse ? ' is-reversed' : ''}`}>
      <div className="about-featurette__copy">
        <h2 className="featurette-heading">{title}</h2>
        <p className="lead">{children}</p>
      </div>
      <div className="about-featurette__media">
        <img src={imageSrc} alt={imageAlt} width="500" height="500" />
      </div>
    </div>
  );
}

function DeveloperProfile({
  children,
  contribution,
  imageClass = 'dImg1',
  imageSrc,
  name,
  role,
}: {
  children?: ReactNode;
  contribution?: ReactNode;
  imageClass?: 'dImg1' | 'dImg2';
  imageSrc: string;
  name: string;
  role: string;
}) {
  return (
    <div className="about-developer-profile">
      <img src={imageSrc} className={imageClass} width="140" height="140" alt={name} />
      <h2 className="dev-3">
        {name}
        <br className="hid-br" /> <span className="text-secondary smalltext">{role}</span>
      </h2>
      {children ? <p className="dev-comment">{children}</p> : null}
      {contribution ? (
        <>
          <div className="card">
            <div className="card-body">
              <p className="card-text">{contribution}</p>
            </div>
          </div>
          <br />
        </>
      ) : null}
    </div>
  );
}

function EagleCheer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isFlying, setIsFlying] = useState(false);

  const primeAudio = () => {
    const audio = audioRef.current;
    if (audio && audio.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      audio.load();
    }
  };

  const launchEagle = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = 0.08;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    }

    setIsFlying(false);
    window.requestAnimationFrame(() => {
      setIsFlying(true);
      window.setTimeout(() => setIsFlying(false), 2100);
    });
  };

  return (
    <>
      <button
        className="about-eagle-cheer"
        type="button"
        onClick={launchEagle}
        onFocus={primeAudio}
        onPointerEnter={primeAudio}
      >
        나주붉은매 화이팅
      </button>
      <audio ref={audioRef} src="/audio/eagle-cry.mp3" preload="auto" />
      {isFlying ? (
        <img
          className="about-flying-eagle"
          src="/images/about-eagle.png"
          alt=""
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

function JshsusIntroduce() {
  return (
    <section className="about-original-section" aria-label="과구리소개">
      <Featurette
        imageAlt="JSHSus 텍스트 아이콘"
        imageSrc="/images/introduce/txtIcon.png"
        title={
          <>
            JSHSus <span className="text-muted">의 탄생</span>
          </>
        }
      >
        학교생활 중에는 분명히 많은 학생의 외침이 있었습니다. 하지만 이들이 존중받지는 못했습니다.
        <br />
        <br />
        JSHSus는 전남과학고등학교 학생회 페이지로 자리 잡아 <b>학생들의 목소리에 힘을 주는</b>{' '}
        서비스를 제공하기 위해 개발되었습니다.
        <br />
        JSHSus는 '전곽'+'우리'의 합성어인 <span className="about-brand-text">과구리</span>라는 한글
        명칭 또한 갖고 있습니다.
      </Featurette>

      <hr className="featurette-divider" />

      <Featurette
        imageAlt="JSHSus 색상 팔레트"
        imageSrc="/images/introduce/jshspallette.png"
        reverse
        title={
          <>
            <br />
            Theme, <span className="text-muted">Turquoise.</span>
          </>
        }
      >
        터키색을 기반으로 4가지 색을 JSHSus 의 팔레트로 지정하여 홈페이지 전반에 걸쳐 사용되고
        있습니다.
        <br />
        <br />
        색의 기준은 RGB 코드로 작성했으며 다음과 같습니다.
        <br />
        <span className="about-color-primary">Primary Color - R: 53, G: 148, B: 138</span>
        <br />
        <span className="about-color-secondary">Secondary Color - R: 105, G: 201, B: 192</span>
        <br />
        <span className="about-color-light">Light Color - R: 173, G: 232, B: 227</span>
        <br />
        <span className="about-color-dark">Dark Color - R: 64, G: 64, B: 64</span>
      </Featurette>

      <hr className="featurette-divider" />

      <Featurette
        imageAlt="JSHSus 아이콘"
        imageSrc="/images/introduce/jshsicon.png"
        title={
          <>
            Icon <span className="text-muted">Design.</span>
          </>
        }
      >
        1:1 의 둥근 정사각형과 기존 테마 색을 응용하여 제작했습니다.
        <br />
        <br />이 아이콘은 전남과학고등학교를 상징하는 JSHS 의 앞 두 글자 'J'와 'S' 자를 품고
        있습니다. 또한 'J'와 'S' 자가 겹쳐 새로운 색을 이루는 모습을 볼 수 있는데, 이는 JSHSus 가
        목표로 하는 <b>학교와 학생의 소통</b>을 상징합니다.
      </Featurette>
    </section>
  );
}

function DeveloperIntroduce() {
  return (
    <section className="about-original-section" aria-label="개발자소개">
      <h2 className="dev-title">Developer Story</h2>
      <h3 className="dev-year">
        1기 개발자 <small className="text-secondary">2019年</small>
      </h3>
      <div className="about-dev-row">
        <DeveloperProfile
          imageSrc="/images/introduce/devhuzi.gif"
          name="HUZI"
          role="Developer / Web Designer"
          contribution={
            <>
              - 과구리 기획 및 운영(~2020)
              <br />- 메인 페이지와 로그인 시스템, Story, 자유 게시판, 탐활서.NET 시스템, 학생회
              관리자 페이지 등 제작
            </>
          }
        >
          안녕하세요. <b>27기 CAMEO 짱 김지후</b>입니다. 과구리 프로젝트가 성공에 이르기까지 많은
          친구들의 도움이 있었습니다 :) 앞으로도 JSHSus 많이 이용해 주세요!
        </DeveloperProfile>

        <DeveloperProfile
          imageSrc="/images/introduce/devsung.gif"
          name="STARlight"
          role="Developer / Planner"
          contribution={
            <>
              - JSHSus 구상 및 진행
              <br />
            </>
          }
        >
          안녕하세요! 전남과학고 <b>26기 학생회장 이성재</b>입니다. 저는 과구리를 처음으로 구상하고
          개발자를 모아 프로젝트를 진행하였습니다. 개발에 참여한 학생들에게 감사함을 전하며 전곽
          학생들의 활발한 활동을 부탁드립니다. 감사합니다!
        </DeveloperProfile>

        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/devjun.gif"
          name="TANG"
          role="Developer"
          contribution={
            <>
              - 사이버 학생회 제작 (청원, 공지사항)
              <br />- 메인 화면 기상 자료
              <br />
            </>
          }
        >
          안녕하세요. <b>27기 IT부 차장 노준호</b>입니다. <br /> 잘 부탁드립니다!
        </DeveloperProfile>
      </div>

      <br />
      <br />

      <div className="about-dev-row">
        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/devhyun.gif"
          name="HYUN"
          role="Icon & Theme Designer"
          contribution={
            <>
              - JSHSus 로고와 아이콘 제작
              <br />- 메인 테마 디자인
              <br />
            </>
          }
        >
          안녕하세요 <b>26기 바탕화면 짱 유현입니다</b>! 저는 과구리의 로고, 아이콘 제작과 테마
          디자인의 일부를 맡았습니다. 사이트 개발에 도움이 되어서 기쁩니다. 많은 이용 부탁드려요!
        </DeveloperProfile>

        <DeveloperProfile
          imageSrc="/images/introduce/devguten.gif"
          name="Guten910"
          role="Developer"
          contribution={<>- JBS (음악 신청, 분실물 센터)</>}
        >
          안녕하세요! <b>27기 JSA 짱 구태경입니다</b>~ 저는 과구리에서 JBS와 관련된 부분을
          맡았습니다. 우리 과구리를 많이 사랑해주시고, 이용해주세요!!! 전곽인 여러분, 언제나 CHEER
          UP!!!
        </DeveloperProfile>

        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/devroot.gif"
          name="JYJ"
          role="Developer"
          contribution={
            <>
              - 과구링크
              <br />- 전곽VIDEO
              <br />- 탐활서 연계
              <br />
            </>
          }
        >
          안녕하세요. <b>26기 IT부 부장 주예준</b>입니다.
        </DeveloperProfile>
      </div>

      <hr className="div-year" />

      <h3 className="dev-year">
        2기 개발자 <small className="text-secondary">2021年</small>
      </h3>
      <div className="about-dev-row">
        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/kch_1.png"
          name="김찬혁"
          role="Developer / Web Designer"
        >
          안녕하세요. <b>28기 IT부 부장 김찬혁</b>입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/kdh_1.png"
          name="김동현"
          role="Developer"
        >
          안녕하세요. <b>28기 IT부 김동현</b>입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/kwh_1.png"
          name="김우현"
          role="Developer"
        >
          안녕하세요. <b>28기 IT부 김우현</b>입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/nkh_1.png"
          name="나기현"
          role="UX Designer"
        >
          안녕하세요. <b>28기 IT부 나기현</b>입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/sah_1.png"
          name="신아현"
          role="Developer / Web Designer"
        >
          안녕하세요. <b>28기 IT부 신아현</b>입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageClass="dImg2"
          imageSrc="/images/introduce/ljy_1.png"
          name="이주연"
          role="UI Designer"
        >
          안녕하세요. <b>28기 IT부 이주연</b>입니다.
        </DeveloperProfile>
        <br />
      </div>

      <hr className="div-year" />

      <h3 className="dev-year">
        3기 개발자 <small className="text-secondary">2022年</small>
      </h3>
      <div className="about-dev-row">
        <DeveloperProfile
          imageSrc="/images/introduce/devroot.gif"
          name="최익준"
          role="Developer / Web Designer"
          contribution={<>- 2022 New 과구리 개발 및 운영</>}
        >
          안녕하세요! <b>29 IT부 부장 최익준입니다</b>! <br />
          저는 2022년 새로운 과구리 개발에 참여했습니다. 처음 부터 하나하나 다시 만들다보니 이전
          과구리에 비해 부족한 부분이 있겠지만, 최대한 노력해서 여러분의 편안한 학교생활을
          책임지겠습니다!
        </DeveloperProfile>
      </div>

      <hr className="div-year" />

      <h3 className="dev-year">
        4기 개발자 <small className="text-secondary">2023年</small>
      </h3>
      <div className="about-dev-row">
        <DeveloperProfile
          imageSrc="/images/introduce/kang_seon_woo.jpg"
          name="강선우"
          role="Developer / Web Designer"
          contribution={<>- 2023 과구리 개발</>}
        >
          안녕하세요. <b>30기 IT부 부장 강선우</b> 입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageSrc="/images/introduce/kim_do_hyeon.jpg"
          name="김도현"
          role="Developer"
          contribution={<>- 2023 과구리 개발</>}
        >
          안녕하세요. <b>30기 IT부 김도현</b> 입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageSrc="/images/introduce/kim_seo_young.jpg"
          name="김서영"
          role="Developer"
          contribution={<>- 2023 과구리 개발</>}
        >
          안녕하세요. <b>30기 IT부 김서영</b> 입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageSrc="/images/introduce/park_min_joo.jpg"
          name="박민주"
          role="Developer"
          contribution={<>- 2023 과구리 개발</>}
        >
          안녕하세요. <b>30기 IT부 박민주</b> 입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageSrc="/images/introduce/song_hyeon_seo.jpg"
          name="송현서"
          role="Developer"
          contribution={<>- 2023 과구리 개발</>}
        >
          안녕하세요. <b>30기 IT부 송현서</b> 입니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageSrc="/images/introduce/jang_eun_seo.jpg"
          name="장은서"
          role="Developer"
          contribution={<>- 2023 과구리 개발</>}
        >
          안녕하세요. <b>30기 IT부 장은서</b> 입니다.
        </DeveloperProfile>
      </div>

      <hr className="div-year" />

      <h3 className="dev-year">
        5기 개발자 <small className="text-secondary">2025年</small>
      </h3>
      <div className="about-dev-row">
        <DeveloperProfile
          imageSrc="/images/introduce/kang_jae_hwan.png"
          name="강재환"
          role="Developer"
          contribution={<>- 2025 과구리 개발</>}
        >
          안녕하세요, <b>32기 IT부 강재환</b>입니다. 과구리 개발에 참여했습니다.
        </DeveloperProfile>

        <DeveloperProfile
          imageSrc="/images/introduce/kim_seong_chan.jpg"
          name="김성찬"
          role="Developer"
          contribution={
            <>
              - 2025 과구리 개발
              <br />
              <EagleCheer />
            </>
          }
        >
          안녕하세요, <b>32기 IT부 김성찬</b>입니다. 과구리 개발에 참여했습니다.
        </DeveloperProfile>
      </div>
    </section>
  );
}

export function AboutPage() {
  const [activeTab, setActiveTab] = useState<AboutTab>('jshsus');

  return (
    <PageScaffold breadcrumbs={[{ label: '소개' }]} title="소개" width="reading" variant="document">
      <article className="static-document about-document">
        <div className="about-tab-list" role="tablist" aria-label="소개 탭">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'developer'}
            className={activeTab === 'developer' ? 'is-active' : undefined}
            onClick={() => setActiveTab('developer')}
          >
            개발자
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'jshsus'}
            className={activeTab === 'jshsus' ? 'is-active' : undefined}
            onClick={() => setActiveTab('jshsus')}
          >
            과구리
          </button>
        </div>

        <div role="tabpanel">
          {activeTab === 'developer' ? <DeveloperIntroduce /> : <JshsusIntroduce />}
        </div>
      </article>
    </PageScaffold>
  );
}
