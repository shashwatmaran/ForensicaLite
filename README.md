# ForensicaLite

A forensic analysis tool built with React, TypeScript, and Vite.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment to GitHub Pages

This project is configured for automatic deployment to GitHub Pages using GitHub Actions.

### Automatic Deployment

1. Push your code to the `main` branch
2. GitHub Actions will automatically build and deploy your site
3. Your site will be available at: `https://[your-username].github.io/ForensicaLite/`

### Manual Deployment

If you prefer to deploy manually:

```bash
# Install dependencies (if not already done)
npm install

# Deploy to GitHub Pages
npm run deploy
```

### GitHub Pages Setup

1. Go to your repository on GitHub
2. Navigate to Settings > Pages
3. Under "Source", select "GitHub Actions"
4. The workflow will automatically deploy when you push to the main branch

## Project Structure

- `src/` - Source code
- `src/components/` - React components
- `src/pages/` - Page components
- `src/context/` - React context providers
- `src/utils/` - Utility functions
- `src/types/` - TypeScript type definitions
- `public/` - Static assets

## Technologies Used

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Chart.js
- Lucide React Icons
