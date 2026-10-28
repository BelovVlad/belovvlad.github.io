export const CURRENT_REVISION = 6;
// The Diploma site is hosted apart from this public hub and asks for a password on every entry.
export const DIPLOMA_URL = 'https://pweb-diploma.pages.dev/';
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
// Sites on this origin whose content the hub search also looks through.
export const SITE_SEARCH = [
  { id:'nsu-s1', name:'НГУ · 4 курс, 1 семестр', base:'/NSU_FP_Y4_S1/docs/' }
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
    ...DIPLOMA_RESOURCES,
    { id: 'github', title: 'GitHub', description: 'Репозитории, исходный код и новые идеи.', url: 'https://github.com/BelovVlad', category: 'links', icon: 'github', favorite: false }
  ],
  settings: { theme: 'dark', view: 'grid', newTab: true, showTasks: false },
  todos: []
};
