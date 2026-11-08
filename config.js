export const CURRENT_REVISION = 13;
// Once Home is the Hyle-space organization Pages root, all its project sites inherit hyle.space.
export const ORIGIN = 'https://hyle.space/';
export const LEGACY_ORG_PAGES = 'https://hyle-space.github.io/';
export const ORG_PAGES = ORIGIN;
// Revision 10: cards saved with the former github.io address move to the domain.
export const FORMER_ORIGIN = 'https://belovvlad.github.io/';
// The Diploma site is its own repository: only encrypted files, opened with a password on every entry.
export const DIPLOMA_URL = ORG_PAGES + 'diploma/';
export const DIPLOMA_CATEGORY = { id:'diploma', name:'Диплом', description:'Литература, отчёт и разработка дипломной работы', icon:'folder' };
export const DIPLOMA_RESOURCES = [
  { id:'diploma-materials', title:'Материалы диплома', description:'Литература, отчёт и разработка. Презентация открывается со страницы диплома.', url:DIPLOMA_URL, category:'diploma', icon:'book', favorite:false }
];
// Revision 5: the presentation card is retired (the Diploma page links to it),
// and untouched seed descriptions are refreshed.
export const DIPLOMA_RETIRED = { id:'diploma-presentation', url:'https://belovvlad.github.io/diploma/web/' };
export const DIPLOMA_OLD_TEXT = { category:'PDF-материалы, пояснения и презентация дипломной работы', materials:'PDF с пояснениями, расчётами и дополнительными материалами.' };
// Former Sites hosting; revision 4 moves saved cards to GitHub Pages.
export const DIPLOMA_MOVED = {
  'https://pweb-diploma.swoonybard26.chatgpt.site/':'https://belovvlad.github.io/diploma/',
  'https://pweb-diploma.swoonybard26.chatgpt.site/web/':'https://belovvlad.github.io/diploma/web/'
};
// Revision 6: cards saved with the former public copy move to the protected site.
export const DIPLOMA_PUBLIC_COPY = 'https://belovvlad.github.io/diploma/';
// Revision 7: the Cloudflare site (blocked in Russia) gives way to the encrypted one above.
export const DIPLOMA_CLOUDFLARE = 'https://pweb-diploma.pages.dev/';
// Revision 8: the Department site (course literature, own repository) joins Education.
export const DEPARTMENT_RESOURCE = { id:'department', title:'Кафедра', description:'Литература курсов кафедры: циклические ускорители, электронная оптика и физика пучков.', url:ORG_PAGES + 'Department/', category:'education', icon:'book', favorite:true };
// Revision 11: the Helper of the Physics Faculty (literature by semester, own repository) joins Education.
export const HELPER_RESOURCE = { id:'helper-ff', title:'Хелпер ФФ', description:'Литература физфака НГУ по семестрам и предметам.', url:ORG_PAGES + 'Helper_PF_NSU/', category:'education', icon:'book', favorite:true };
// Revision 9: the seed sections get Russian names (only where the user kept the original name),
// and the draft of the second semester says why it has no address yet.
export const CATEGORY_RENAMES = { education:['Education','Учёба'], projects:['Projects','Проекты'], tools:['Tools','Инструменты'], links:['Links','Ссылки'], personal:['Personal','Личное'] };
export const DRAFT_TEXT = { id:'nsu-s2', old:'Материалы следующего семестра.', text:'Заготовка: адрес появится, когда начнётся семестр.' };
// Monograms of the seed cards; any other card takes the initials of its title unless one is set.
export const SEED_MONOGRAMS = { 'nsu-s1':'НГУ', 'nsu-s2':'НГУ', department:'КФ', 'helper-ff':'ФФ', 'diploma-materials':'ДП', github:'GH' };
// Public project Pages are hosted by Hyle-space; the local search worker reads their indexes
// over CORS (no cross-origin Worker construction). Facets match each site's own filters.
export const SITE_SEARCH = [
  { id:'nsu-s1', name:'НГУ · 4 курс, 1 семестр', label:'НГУ', base:ORG_PAGES+'NSU_FP_Y4_S1/docs/', home:ORG_PAGES+'NSU_FP_Y4_S1/docs/', searchHash:true,
    facetsFromPath:true, facets:[{ key:'section', label:'Раздел' }, { key:'subject', label:'Предмет' }],
    exclude:['ФЭЧ/04_Литератру/PhysRevD.pdf'], skipFolders:['LaTeX'], links:{ 'База/Частицы.ipynb':'particles/' } },
  { id:'department', name:'Кафедра', label:'Кафедра', base:ORG_PAGES+'Department/viewer/', home:ORG_PAGES+'Department/',
    facets:[{ key:'subject', label:'Курс' }] }
];

// Initial resources only. Personal changes are stored in this browser.
export default {
  version: 1,
  revision: CURRENT_REVISION,
  categories: [
    { id: 'education', name: 'Учёба', description: 'Учёба и материалы', icon: 'book' },
    DIPLOMA_CATEGORY,
    { id: 'projects', name: 'Проекты', description: 'Идеи, которые становятся проектами', icon: 'code' },
    { id: 'tools', name: 'Инструменты', description: 'Инструменты на каждый день', icon: 'tool' },
    { id: 'links', name: 'Ссылки', description: 'Полезное под рукой', icon: 'link' },
    { id: 'personal', name: 'Личное', description: 'Ваше личное пространство', icon: 'user' }
  ],
  resources: [
    { id: 'nsu-s1', title: 'НГУ · 4 курс, 1 семестр', description: 'Конспекты, семинары и учебные материалы физического факультета.', url: ORG_PAGES + 'NSU_FP_Y4_S1/', category: 'education', icon: 'book', favorite: true },
    { id: 'nsu-s2', title: 'НГУ · 4 курс, 2 семестр', description: 'Заготовка: адрес появится, когда начнётся семестр.', url: '', category: 'education', icon: 'book', favorite: false },
    DEPARTMENT_RESOURCE,
    ...DIPLOMA_RESOURCES,
    HELPER_RESOURCE,
    { id: 'github', title: 'GitHub', description: 'Репозитории, исходный код и новые идеи.', url: 'https://github.com/BelovVlad', category: 'links', icon: 'github', favorite: false }
  ],
  settings: { theme: 'dark', view: 'grid', newTab: true, showTasks: false },
  todos: []
};
