const localeOptions = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'fr', label: 'Français' },
  { code: 'ar', label: 'العربية' },
];

const CNB_RELEASE_ROOT = 'https://cnb.cool/chenarmy/GITBX/-/releases';
const FALLBACK_VERSION = '0.1.20';
const currentDownloads = createDownloadLinks(FALLBACK_VERSION);

function createDownloadLinks(version) {
  const tag = version.startsWith('v') ? version : `v${version}`;
  const cleanVersion = tag.slice(1);
  const base = `${CNB_RELEASE_ROOT}/download/${tag}`;
  return {
    'windows-exe': `${base}/GITBX_${cleanVersion}_x64-setup.exe`,
    'windows-msi': `${base}/GITBX_${cleanVersion}_x64_en-US.msi`,
    'macos-dmg': `${base}/GITBX_${cleanVersion}_aarch64.dmg`,
    'linux-appimage': `${base}/GITBX_${cleanVersion}_amd64.AppImage`,
    'linux-deb': `${base}/GITBX_${cleanVersion}_amd64.deb`,
  };
}

function detectPlatformDownload() {
  const platform = `${navigator.userAgentData?.platform || navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (platform.includes('mac')) return { key: 'macos-dmg', label: 'macOS · Apple Silicon · DMG' };
  if (platform.includes('linux')) return { key: 'linux-appimage', label: 'Linux · x64 · AppImage' };
  return { key: 'windows-exe', label: 'Windows 10/11 · x64 · EXE' };
}

function updateDownloadLinks() {
  document.querySelectorAll('[data-download]').forEach((link) => {
    link.href = currentDownloads[link.dataset.download];
  });
  const preferred = detectPlatformDownload();
  document.querySelectorAll('[data-download-default]').forEach((link) => {
    link.href = currentDownloads[preferred.key];
  });
  const platformLabel = document.querySelector('#primary-download-platform');
  if (platformLabel) platformLabel.textContent = preferred.label;
}

const zhCN = {
  skip:'跳到主要内容',navFeatures:'功能',navWorkflow:'工作流',navPlatforms:'平台',navDocs:'文档',eyebrow:'为专注工作而生的 Git 客户端',heroLead:'让复杂的 Git，',heroAccent:'变得清晰而从容。',heroCopy:'约 20MB 的轻量体积，装下提交图谱、精细暂存、三方合并与 AI 协作。快到无感，强到够用。',download:'下载 GITBX',downloadSub:'Windows · macOS · Linux',viewSource:'查看源代码',metricSize:'轻量安装包',metricGraph:'流畅提交图谱',metricMerge:'可视化冲突合并',metricLanguages:'内置界面语言',featureKicker:'核心能力',featureTitle:'你每天需要的，<br />每一样都恰到好处。',featureCopy:'从查看历史到解决冲突，GITBX 把高频 Git 工作流放进一个快速、克制且可信赖的界面。',f1Title:'提交历史，一眼看清',f1Copy:'Canvas 虚拟拓扑图在大型仓库中依然流畅。分支、标签与提交关系清晰呈现，定位上下文不再费力。',f2Title:'改哪行，就提交哪行',f2Copy:'Hunk 与行级暂存让每次提交都保持干净、专注、可审阅。',f3Title:'冲突解决，不再心慌',f3Copy:'三方合并编辑器并排展示来源、目标与结果，配合 AI 建议更快做出正确选择。',f4Title:'AI 懂代码，也懂你的变更',f4Copy:'生成准确的提交信息、分析冲突、探测敏感凭据。通过原生 MCP Server，让 Coding Agent 直接参与 Git 协作。',workflowKicker:'一个完整的工作流',workflowTitle:'从第一行改动，到最后一次推送。',workflowCopy:'不用在窗口和命令之间来回切换，保持上下文，专注完成工作。',w1Title:'看见上下文',w1Copy:'浏览提交图谱与分支关系',w2Title:'组织变更',w2Copy:'按文件、Hunk 或行精细暂存',w3Title:'放心提交',w3Copy:'AI 生成信息并检查敏感内容',w4Title:'安全同步',w4Copy:'Fetch、Pull 与 Push 尽在掌控',platformKicker:'一个内核，两种工作方式',platformTitle:'在桌面极速工作，<br />也在浏览器随时访问。',platformCopy:'原生桌面应用与自托管 Web 服务共享同一套 Rust Git 内核。个人工作站或团队服务器，都得到一致、可靠的体验。',ctaTitle:'准备好，用更轻的方式驾驭 Git？',ctaCopy:'免费、开源、跨平台。现在就开始。',downloadNow:'下载最新版本',githubVisit:'访问 GitHub',footerTagline:'轻量、极速、AI 原生的 Git 客户端。',releases:'版本发布',changelog:'更新日志',issues:'问题反馈'
};

const translations = {
  'zh-CN': zhCN,
  en: {skip:'Skip to content',navFeatures:'Features',navWorkflow:'Workflow',navPlatforms:'Platforms',navDocs:'Docs',eyebrow:'The Git client built for focused work',heroLead:'Complex Git,',heroAccent:'made clear and calm.',heroCopy:'Commit graphs, precision staging, 3-way merge, and AI collaboration in a lightweight ~20 MB app. Effortlessly fast. Genuinely capable.',download:'Download GITBX',downloadSub:'Windows · macOS · Linux',viewSource:'View source',metricSize:'Lightweight installer',metricGraph:'Fluid commit graph',metricMerge:'Visual conflict merge',metricLanguages:'Built-in UI languages',featureKicker:'Core capabilities',featureTitle:'Everything you need daily,<br />and nothing in your way.',featureCopy:'From reading history to resolving conflicts, GITBX puts frequent Git workflows into one fast, focused, dependable interface.',f1Title:'History you understand at a glance',f1Copy:'The virtualized Canvas graph stays smooth in large repositories. Branches, tags, and commit relationships remain easy to follow.',f2Title:'Stage exactly what you mean',f2Copy:'Hunk and line staging keep every commit clean, focused, and reviewable.',f3Title:'Resolve conflicts with confidence',f3Copy:'A 3-way merge editor shows source, target, and result side by side, with AI suggestions when you need them.',f4Title:'AI that understands your changes',f4Copy:'Write accurate commit messages, analyze conflicts, and spot leaked secrets. The native MCP server brings coding agents into your Git workflow.',workflowKicker:'One complete workflow',workflowTitle:'From the first edit to the final push.',workflowCopy:'Keep your context and finish the work without jumping between windows and commands.',w1Title:'See the context',w1Copy:'Explore commits and branch relationships',w2Title:'Shape the change',w2Copy:'Stage by file, hunk, or line',w3Title:'Commit confidently',w3Copy:'Generate messages and scan secrets with AI',w4Title:'Sync safely',w4Copy:'Fetch, pull, and push under control',platformKicker:'One core, two ways to work',platformTitle:'Native speed on desktop.<br />Available anywhere on the web.',platformCopy:'The native desktop app and self-hosted web service share the same Rust Git core, delivering one reliable experience on a workstation or team server.',ctaTitle:'Ready for a lighter way to master Git?',ctaCopy:'Free, open source, and cross-platform. Start now.',downloadNow:'Download latest',githubVisit:'Visit GitHub',footerTagline:'A lightweight, blazingly fast, AI-native Git client.',releases:'Releases',changelog:'Changelog',issues:'Issues'},
  'zh-TW': {...zhCN,skip:'跳到主要內容',navFeatures:'功能',navWorkflow:'工作流程',navPlatforms:'平台',navDocs:'文件',eyebrow:'為專注工作而生的 Git 用戶端',heroLead:'讓複雜的 Git，',heroAccent:'變得清晰而從容。',heroCopy:'約 20MB 的輕量體積，裝下提交圖譜、精細暫存、三方合併與 AI 協作。快到無感，強到夠用。',featureKicker:'核心能力',featureTitle:'你每天需要的，<br />每一樣都恰到好處。',featureCopy:'從查看歷史到解決衝突，GITBX 把高頻 Git 工作流程放進一個快速、克制且可信賴的介面。',f1Title:'提交歷史，一眼看清',f2Title:'改哪行，就提交哪行',f3Title:'解決衝突，不再慌張',workflowKicker:'一個完整的工作流程',platformKicker:'一個核心，兩種工作方式',ctaTitle:'準備好，用更輕的方式駕馭 Git？',downloadNow:'下載最新版本',releases:'版本發布',changelog:'更新日誌',issues:'問題回報'},
  ja: {skip:'メインコンテンツへ',navFeatures:'機能',navWorkflow:'ワークフロー',navPlatforms:'プラットフォーム',navDocs:'ドキュメント',eyebrow:'集中するために生まれた Git クライアント',heroLead:'複雑な Git を、',heroAccent:'明快で心地よく。',heroCopy:'約20MBの軽さに、コミットグラフ、精密ステージング、3-wayマージ、AI連携を凝縮。驚くほど速く、必要十分に強力です。',download:'GITBX をダウンロード',downloadSub:'Windows · macOS · Linux',viewSource:'ソースを見る',metricSize:'軽量インストーラー',metricGraph:'滑らかなコミットグラフ',metricMerge:'視覚的な競合解決',metricLanguages:'内蔵UI言語',featureKicker:'主な機能',featureTitle:'毎日必要なものを、<br />ちょうどよく。',featureCopy:'履歴の確認から競合解決まで、日常の Git 作業を高速で信頼できる一つの画面に。',f1Title:'履歴を一目で理解',f1Copy:'大規模リポジトリでも滑らかな Canvas グラフ。ブランチ、タグ、コミットの関係が明快です。',f2Title:'変更した行だけをコミット',f2Copy:'Hunk・行単位のステージングで、クリーンでレビューしやすいコミットを。',f3Title:'競合解決にも余裕を',f3Copy:'3-wayエディターで双方と結果を並べ、AIの提案とともに正しく選べます。',f4Title:'変更を理解する AI',f4Copy:'コミット文の生成、競合分析、機密情報の検出。MCP ServerでコーディングエージェントもGit作業に参加できます。',workflowKicker:'ひとつながりのワークフロー',workflowTitle:'最初の編集から、最後の Push まで。',workflowCopy:'ウィンドウとコマンドを往復せず、文脈を保ったまま作業に集中できます。',w1Title:'文脈を見る',w1Copy:'コミットとブランチ関係を確認',w2Title:'変更を整える',w2Copy:'ファイル・Hunk・行でステージ',w3Title:'安心してコミット',w3Copy:'AIでメッセージ生成と機密チェック',w4Title:'安全に同期',w4Copy:'Fetch・Pull・Pushを確実に',platformKicker:'一つのコア、二つの働き方',platformTitle:'デスクトップで高速に。<br />ブラウザからいつでも。',platformCopy:'ネイティブアプリとセルフホストWebは同じRust Gitコアを共有。個人でもチームでも一貫した体験です。',ctaTitle:'もっと軽やかに Git を使いませんか？',ctaCopy:'無料、オープンソース、クロスプラットフォーム。',downloadNow:'最新版をダウンロード',githubVisit:'GitHub を開く',footerTagline:'軽量・高速・AIネイティブな Git クライアント。',releases:'リリース',changelog:'更新履歴',issues:'フィードバック'},
  de: {skip:'Zum Inhalt',navFeatures:'Funktionen',navWorkflow:'Workflow',navPlatforms:'Plattformen',navDocs:'Dokumentation',eyebrow:'Der Git-Client für fokussiertes Arbeiten',heroLead:'Komplexes Git,',heroAccent:'klar und gelassen.',heroCopy:'Commit-Graph, präzises Staging, 3-Wege-Merge und KI-Zusammenarbeit in einer leichten App von ca. 20 MB. Mühelos schnell und wirklich leistungsfähig.',download:'GITBX herunterladen',downloadSub:'Windows · macOS · Linux',viewSource:'Quellcode ansehen',metricSize:'Kleines Installationspaket',metricGraph:'Flüssiger Commit-Graph',metricMerge:'Visuelle Konfliktlösung',metricLanguages:'Integrierte Sprachen',featureKicker:'Kernfunktionen',featureTitle:'Alles, was du täglich brauchst,<br />ohne Ballast.',featureCopy:'Von der Historie bis zur Konfliktlösung bringt GITBX häufige Git-Abläufe in eine schnelle, fokussierte Oberfläche.',f1Title:'Historie auf einen Blick',f1Copy:'Der virtualisierte Canvas-Graph bleibt auch in großen Repositories flüssig. Branches, Tags und Commits sind sofort verständlich.',f2Title:'Stage genau deine Änderung',f2Copy:'Hunk- und zeilenweises Staging hält jeden Commit sauber und gut prüfbar.',f3Title:'Konflikte souverän lösen',f3Copy:'Der 3-Wege-Editor zeigt Quelle, Ziel und Ergebnis nebeneinander – ergänzt durch KI-Vorschläge.',f4Title:'KI, die Änderungen versteht',f4Copy:'Präzise Commit-Texte, Konfliktanalyse und Geheimnis-Scan. Der native MCP-Server bindet Coding Agents direkt ein.',workflowKicker:'Ein vollständiger Workflow',workflowTitle:'Von der ersten Änderung bis zum Push.',workflowCopy:'Kontext behalten und ohne Wechsel zwischen Fenstern und Befehlen arbeiten.',w1Title:'Kontext sehen',w1Copy:'Commits und Branches erkunden',w2Title:'Änderungen ordnen',w2Copy:'Nach Datei, Hunk oder Zeile stagen',w3Title:'Sicher committen',w3Copy:'KI-Texte und Secret-Scan',w4Title:'Sicher synchronisieren',w4Copy:'Fetch, Pull und Push im Griff',platformKicker:'Ein Kern, zwei Arbeitsweisen',platformTitle:'Nativ schnell am Desktop.<br />Im Web überall erreichbar.',platformCopy:'Desktop-App und selbst gehosteter Webdienst teilen denselben Rust-Git-Kern – zuverlässig am Arbeitsplatz und im Team.',ctaTitle:'Bereit für die leichtere Art, Git zu meistern?',ctaCopy:'Kostenlos, Open Source und plattformübergreifend.',downloadNow:'Neueste Version',githubVisit:'GitHub besuchen',footerTagline:'Ein leichter, schneller, KI-nativer Git-Client.',releases:'Releases',changelog:'Änderungen',issues:'Feedback'},
  es: {skip:'Ir al contenido',navFeatures:'Funciones',navWorkflow:'Flujo de trabajo',navPlatforms:'Plataformas',navDocs:'Documentación',eyebrow:'El cliente Git creado para trabajar con foco',heroLead:'Git complejo,',heroAccent:'claro y bajo control.',heroCopy:'Grafo de commits, staging preciso, fusión de tres vías y colaboración con IA en una aplicación ligera de ~20 MB. Rápida de verdad y muy capaz.',download:'Descargar GITBX',downloadSub:'Windows · macOS · Linux',viewSource:'Ver código fuente',metricSize:'Instalador ligero',metricGraph:'Grafo de commits fluido',metricMerge:'Fusión visual de conflictos',metricLanguages:'Idiomas integrados',featureKicker:'Capacidades principales',featureTitle:'Todo lo que necesitas a diario,<br />sin estorbar.',featureCopy:'Del historial a la resolución de conflictos, GITBX reúne los flujos Git frecuentes en una interfaz rápida y fiable.',f1Title:'El historial, claro de un vistazo',f1Copy:'El grafo Canvas virtualizado sigue fluido en repositorios grandes. Ramas, etiquetas y commits se entienden al instante.',f2Title:'Prepara exactamente tu cambio',f2Copy:'El staging por hunk y línea mantiene cada commit limpio y fácil de revisar.',f3Title:'Resuelve conflictos con confianza',f3Copy:'El editor de tres vías muestra origen, destino y resultado en paralelo, con sugerencias de IA.',f4Title:'IA que entiende tus cambios',f4Copy:'Genera mensajes precisos, analiza conflictos y detecta secretos. El servidor MCP integra agentes de programación.',workflowKicker:'Un flujo completo',workflowTitle:'Desde la primera edición hasta el último push.',workflowCopy:'Mantén el contexto y termina el trabajo sin saltar entre ventanas y comandos.',w1Title:'Entiende el contexto',w1Copy:'Explora commits y relaciones de ramas',w2Title:'Organiza el cambio',w2Copy:'Staging por archivo, hunk o línea',w3Title:'Confirma con confianza',w3Copy:'Mensajes y revisión de secretos con IA',w4Title:'Sincroniza con seguridad',w4Copy:'Fetch, pull y push bajo control',platformKicker:'Un núcleo, dos formas de trabajar',platformTitle:'Velocidad nativa en escritorio.<br />Acceso web en cualquier lugar.',platformCopy:'La aplicación nativa y el servicio web autoalojado comparten el mismo núcleo Git en Rust para una experiencia coherente.',ctaTitle:'¿Listo para dominar Git de forma más ligera?',ctaCopy:'Gratis, código abierto y multiplataforma.',downloadNow:'Descargar última versión',githubVisit:'Visitar GitHub',footerTagline:'Un cliente Git ligero, veloz y nativo de IA.',releases:'Versiones',changelog:'Cambios',issues:'Comentarios'},
  fr: {skip:'Aller au contenu',navFeatures:'Fonctionnalités',navWorkflow:'Flux de travail',navPlatforms:'Plateformes',navDocs:'Documentation',eyebrow:'Le client Git conçu pour rester concentré',heroLead:'Git complexe,',heroAccent:'clair et serein.',heroCopy:'Graphe de commits, staging précis, fusion à trois voies et collaboration IA dans une application légère d’environ 20 Mo. Rapide et réellement capable.',download:'Télécharger GITBX',downloadSub:'Windows · macOS · Linux',viewSource:'Voir le code source',metricSize:'Installateur léger',metricGraph:'Graphe fluide',metricMerge:'Fusion visuelle des conflits',metricLanguages:'Langues intégrées',featureKicker:'Fonctions essentielles',featureTitle:'Tout ce qu’il faut au quotidien,<br />sans distraction.',featureCopy:'De l’historique à la résolution des conflits, GITBX rassemble les flux Git fréquents dans une interface rapide et fiable.',f1Title:'L’historique compris en un regard',f1Copy:'Le graphe Canvas virtualisé reste fluide sur les grands dépôts. Branches, tags et commits sont immédiatement lisibles.',f2Title:'Stagez exactement votre intention',f2Copy:'Le staging par hunk et par ligne garde chaque commit propre et facile à relire.',f3Title:'Résolvez les conflits sereinement',f3Copy:'L’éditeur à trois voies aligne source, cible et résultat, avec les suggestions de l’IA.',f4Title:'Une IA qui comprend vos changements',f4Copy:'Messages précis, analyse des conflits et détection de secrets. Le serveur MCP intègre les agents de code à Git.',workflowKicker:'Un flux complet',workflowTitle:'De la première modification au dernier push.',workflowCopy:'Gardez le contexte et avancez sans jongler entre fenêtres et commandes.',w1Title:'Voir le contexte',w1Copy:'Explorer commits et branches',w2Title:'Organiser les changements',w2Copy:'Stage par fichier, hunk ou ligne',w3Title:'Committer sereinement',w3Copy:'Messages IA et contrôle des secrets',w4Title:'Synchroniser sûrement',w4Copy:'Fetch, pull et push maîtrisés',platformKicker:'Un cœur, deux façons de travailler',platformTitle:'Rapide sur le bureau.<br />Accessible partout sur le Web.',platformCopy:'L’application native et le service Web auto-hébergé partagent le même cœur Git en Rust pour une expérience cohérente.',ctaTitle:'Prêt à maîtriser Git plus légèrement ?',ctaCopy:'Gratuit, open source et multiplateforme.',downloadNow:'Télécharger la dernière version',githubVisit:'Visiter GitHub',footerTagline:'Un client Git léger, rapide et natif IA.',releases:'Versions',changelog:'Nouveautés',issues:'Retours'},
  ar: {skip:'الانتقال إلى المحتوى',navFeatures:'الميزات',navWorkflow:'سير العمل',navPlatforms:'المنصات',navDocs:'الوثائق',eyebrow:'عميل Git مصمم للعمل بتركيز',heroLead:'Git معقد،',heroAccent:'أصبح واضحًا وهادئًا.',heroCopy:'مخطط الالتزامات والتحضير الدقيق والدمج الثلاثي وتعاون الذكاء الاصطناعي في تطبيق خفيف بحجم يقارب 20 ميجابايت. سريع وقادر حقًا.',download:'تنزيل GITBX',downloadSub:'Windows · macOS · Linux',viewSource:'عرض المصدر',metricSize:'حزمة تثبيت خفيفة',metricGraph:'مخطط التزامات سلس',metricMerge:'دمج مرئي للتعارضات',metricLanguages:'لغات واجهة مدمجة',featureKicker:'القدرات الأساسية',featureTitle:'كل ما تحتاجه يوميًا،<br />دون أن يعيقك شيء.',featureCopy:'من قراءة السجل إلى حل التعارضات، يجمع GITBX مهام Git المتكررة في واجهة سريعة وموثوقة.',f1Title:'سجل تفهمه بنظرة واحدة',f1Copy:'يبقى مخطط Canvas سلسًا حتى في المستودعات الكبيرة، وتظهر علاقات الفروع والعلامات والالتزامات بوضوح.',f2Title:'حضّر ما تقصده بدقة',f2Copy:'التحضير حسب المقطع أو السطر يحافظ على كل التزام نظيفًا وسهل المراجعة.',f3Title:'حل التعارضات بثقة',f3Copy:'يعرض محرر الدمج الثلاثي المصدر والهدف والنتيجة جنبًا إلى جنب مع اقتراحات الذكاء الاصطناعي.',f4Title:'ذكاء اصطناعي يفهم تغييراتك',f4Copy:'أنشئ رسائل دقيقة وحلل التعارضات واكتشف الأسرار. يدمج خادم MCP الوكلاء البرمجيين في سير Git.',workflowKicker:'سير عمل متكامل',workflowTitle:'من أول تعديل إلى آخر دفع.',workflowCopy:'حافظ على السياق وأنهِ العمل دون التنقل بين النوافذ والأوامر.',w1Title:'شاهد السياق',w1Copy:'استكشف الالتزامات وعلاقات الفروع',w2Title:'نظّم التغيير',w2Copy:'حضّر حسب الملف أو المقطع أو السطر',w3Title:'التزم بثقة',w3Copy:'رسائل وفحص أسرار بالذكاء الاصطناعي',w4Title:'زامن بأمان',w4Copy:'تحكم في الجلب والسحب والدفع',platformKicker:'نواة واحدة، طريقتان للعمل',platformTitle:'سرعة أصلية على سطح المكتب.<br />ووصول من الويب في أي مكان.',platformCopy:'يتشارك تطبيق سطح المكتب وخدمة الويب ذاتية الاستضافة نواة Git نفسها المكتوبة بلغة Rust لتجربة موثوقة ومتسقة.',ctaTitle:'هل أنت مستعد لطريقة أخف لإتقان Git؟',ctaCopy:'مجاني، مفتوح المصدر، ومتعدد المنصات.',downloadNow:'تنزيل أحدث إصدار',githubVisit:'زيارة GitHub',footerTagline:'عميل Git خفيف وسريع ومدعوم بالذكاء الاصطناعي.',releases:'الإصدارات',changelog:'سجل التغييرات',issues:'الملاحظات'}
};

const language = document.querySelector('.language');
const languageButton = document.querySelector('.language-button');
const languageMenu = document.querySelector('.language-menu');
const currentLanguage = document.querySelector('#current-language');

function normalizeLocale(value) {
  if (translations[value]) return value;
  const short = String(value || '').toLowerCase();
  if (short.startsWith('zh-tw') || short.startsWith('zh-hk')) return 'zh-TW';
  if (short.startsWith('zh')) return 'zh-CN';
  return localeOptions.find(({code}) => short.startsWith(code.toLowerCase()))?.code || 'zh-CN';
}

function applyLocale(code) {
  const locale = normalizeLocale(code);
  const dictionary = translations[locale];
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const value = dictionary[node.dataset.i18n] ?? zhCN[node.dataset.i18n];
    if (value) node.innerHTML = value;
  });
  currentLanguage.textContent = localeOptions.find((item) => item.code === locale).label;
  document.querySelectorAll('.language-option').forEach((button) => {
    const active = button.dataset.locale === locale;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  localStorage.setItem('gitbx_site_locale', locale);
}

localeOptions.forEach((item) => {
  const button = document.createElement('button');
  button.className = 'language-option';
  button.type = 'button';
  button.role = 'option';
  button.dataset.locale = item.code;
  button.innerHTML = `<span>${item.label}</span><small>${item.code}</small>`;
  button.addEventListener('click', () => {
    applyLocale(item.code);
    language.classList.remove('open');
    languageButton.setAttribute('aria-expanded', 'false');
  });
  languageMenu.appendChild(button);
});

languageButton.addEventListener('click', () => {
  const open = language.classList.toggle('open');
  languageButton.setAttribute('aria-expanded', String(open));
});

const downloadControl = document.querySelector('.download-control');
const downloadMore = document.querySelector('.download-more');
downloadMore.addEventListener('click', () => {
  const open = downloadControl.classList.toggle('open');
  downloadMore.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (event) => {
  if (!language.contains(event.target)) {
    language.classList.remove('open');
    languageButton.setAttribute('aria-expanded', 'false');
  }
  if (!downloadControl.contains(event.target)) {
    downloadControl.classList.remove('open');
    downloadMore.setAttribute('aria-expanded', 'false');
  }
});

const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
menuToggle.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
navLinks.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  navLinks.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

const header = document.querySelector('.site-header');
window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 20), { passive: true });

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });
document.querySelectorAll('.reveal').forEach((element, index) => {
  element.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  observer.observe(element);
});

const initialLocale = localStorage.getItem('gitbx_site_locale') || navigator.language || 'zh-CN';
applyLocale(initialLocale);
updateDownloadLinks();
