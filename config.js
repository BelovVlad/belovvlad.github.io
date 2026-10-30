export const CURRENT_REVISION = 8;
// The Diploma site is its own repository: only encrypted files, opened with a password on every entry.
export const DIPLOMA_URL = 'https://belovvlad.github.io/diploma/';
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
export const DEPARTMENT_RESOURCE = { id:'department', title:'Кафедра', description:'Литература курсов кафедры: циклические ускорители, электронная оптика и физика пучков.', url:'https://belovvlad.github.io/Department/', category:'education', icon:'book', favorite:true };
// Sites on this origin whose content the hub search also looks through (their own search
// worker and index under base). facets are the filters shown when one site is chosen.
export const SITE_SEARCH = [
  { id:'nsu-s1', name:'НГУ · 4 курс, 1 семестр', label:'НГУ', base:'/NSU_FP_Y4_S1/docs/', home:'/NSU_FP_Y4_S1/docs/', searchHash:true,
    facetsFromPath:true, facets:[{ key:'section', label:'Раздел' }, { key:'subject', label:'Предмет' }],
    exclude:['ФЭЧ/04_Литератру/PhysRevD.pdf'], skipFolders:['LaTeX'], links:{ 'База/Частицы.ipynb':'particles/' } },
  { id:'department', name:'Кафедра', label:'Кафедра', base:'/Department/viewer/', home:'/Department/',
    facets:[{ key:'subject', label:'Курс' }] }
];

// Initial resources only. Personal changes are stored in this browser.
export default {
  version: 1,
  revision: CURRENT_REVISION,
  categories: [
    { id: 'education', name: 'Education', description: 'Учёба и материалы', icon: 'book' },
    DIPLOMA_CATEGORY,
    { id: 'projects', name: 'Projects', description: 'Идеи, которые становятся проектами', icon: 'code' },
    { id: 'tools', name: 'Tools', description: 'Инструменты на каждый день', icon: 'tool' },
    { id: 'links', name: 'Links', description: 'Полезное под рукой', icon: 'link' },
    { id: 'personal', name: 'Personal', description: 'Ваше личное пространство', icon: 'user' }
  ],
  resources: [
    { id: 'nsu-s1', title: 'НГУ · 4 курс, 1 семестр', description: 'Конспекты, семинары и учебные материалы физического факультета.', url: 'https://belovvlad.github.io/NSU_FP_Y4_S1/', category: 'education', icon: 'book', favorite: true },
    { id: 'nsu-s2', title: 'НГУ · 4 курс, 2 семестр', description: 'Материалы следующего семестра.', url: '', category: 'education', icon: 'book', favorite: false },
    DEPARTMENT_RESOURCE,
    ...DIPLOMA_RESOURCES,
    { id: 'github', title: 'GitHub', description: 'Репозитории, исходный код и новые идеи.', url: 'https://github.com/BelovVlad', category: 'links', icon: 'github', favorite: false }
  ],
  settings: { theme: 'dark', view: 'grid', newTab: true, showTasks: false },
  todos: []
};
