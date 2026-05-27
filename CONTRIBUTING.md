# Contributing to Memex

We love your contributions! Whether it's fixing a bug, adding a new AI classifier, or improving the UI, here's how you can help.

## 🛠️ Development Setup

1.  **Clone the Repo**:
    ```bash
    git clone https://github.com/yourusername/memex.git
    cd memex
    ```
2.  **Follow the Quick Start**: See the [README.md](../README.md) for environment setup.
3.  **Project Structure**:
    - `client/`: React + Vite frontend.
    - `server/`: Node.js + Express backend.
    - `shared/`: TypeScript interfaces shared between both.

## 📜 Coding Standards

- **TypeScript**: We use strict TypeScript. Avoid `any` at all costs.
- **Tailwind CSS**: Use existing design tokens defined in `tailwind.config.ts`.
- **Security**: Never log sensitive data or credentials. Use the `apiFetch` wrapper in the client to handle auth headers automatically.
- **AI**: When adding new classifiers, update `server/src/services/classifier.ts` and add a corresponding card in `client/src/components/cards/`.

## 🚀 Pull Request Process

1.  Create a new branch: `feature/your-feature-name` or `fix/issue-name`.
2.  Ensure your code builds: `npm run build` in both client and server.
3.  Submit your PR with a clear description of the changes and a screenshot (if UI related).

## 🛡️ Security
If you find a security vulnerability, please do NOT open a public issue. Instead, email security@example.com.

---
*Thank you for making personal knowledge more private and powerful!*
