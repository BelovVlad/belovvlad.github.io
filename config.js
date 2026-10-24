// Initial resources only. Personal changes are stored in this browser.
export default {
  version: 1,
  categories: [
    { id: 'education', name: 'Education', description: 'Учёба и материалы', icon: 'book' },
    { id: 'projects', name: 'Projects', description: 'Идеи, которые становятся проектами', icon: 'code' },
    { id: 'tools', name: 'Tools', description: 'Инструменты на каждый день', icon: 'tool' },
    { id: 'links', name: 'Links', description: 'Полезное под рукой', icon: 'link' },
    { id: 'personal', name: 'Personal', description: 'Ваше личное пространство', icon: 'user' }
  ],
  resources: [
    { id: 'nsu-s1', title: 'НГУ · 4 курс, 1 семестр', description: 'Конспекты, семинары и учебные материалы физического факультета.', url: 'https://belovvlad.github.io/NSU_FP_Y4_S1/', category: 'education', icon: 'book', favorite: true },
    { id: 'nsu-s2', title: 'НГУ · 4 курс, 2 семестр', description: 'Место для следующего семестра. Ссылку можно добавить позже.', url: '', category: 'education', icon: 'book', favorite: false },
    { id: 'darknotes', title: 'DarkNotes', description: 'Рукописные заметки и аннотации PDF. Ваши мысли — в одном месте.', url: 'https://belovvlad.github.io/DarkNotes/', category: 'tools', icon: 'pen', favorite: true },
    { id: 'github', title: 'GitHub', description: 'Репозитории, исходный код и новые идеи.', url: 'https://github.com/BelovVlad', category: 'links', icon: 'github', favorite: false }
  ],
  settings: { theme: 'dark', view: 'grid', newTab: true },
  todos: []
};
