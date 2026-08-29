export default defineAppConfig({
  ui: {
    colors: {
      primary: 'havelock-blue',
      neutral: 'slate'
    }
  },
  toc: {
    title: 'Table of Contents',
    bottom: {
      title: 'Links',
      edit: 'https://github.com/frctools/order-list/edit/main/content',
      links: [
        {
          icon: 'i-lucide-star',
          label: 'FRCTools on GitHub',
          to: 'https://github.com/frctools/order-list',
          target: '_blank'
        },
        {
          icon: 'i-lucide-external-link',
          label: 'Go to App',
          to: 'https://parts.innovatorsrobotics.com',
          target: '_blank'
        }
      ]
    }
  }
})
