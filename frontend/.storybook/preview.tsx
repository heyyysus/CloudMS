import type { Preview } from '@storybook/react-vite'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },

  globalTypes: {
    theme: {
      description: 'Color scheme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },

  initialGlobals: {
    theme: 'light',
  },

  decorators: [
    (Story, { globals }) => {
      document.documentElement.classList.toggle('dark', globals.theme === 'dark')
      return (
        <div className="bg-background text-foreground p-4">
          <Story />
        </div>
      )
    },
  ],
};

export default preview;