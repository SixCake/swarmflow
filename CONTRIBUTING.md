# Contributing to SwarmFlow

Thank you for your interest in contributing to SwarmFlow! This document provides guidelines and instructions for contributing to the project.

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- A clear and descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Environment details (Node.js version, OS, etc.)
- Screenshots or error messages if applicable

Use the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md) when reporting bugs.

### Suggesting Features

Feature suggestions are welcome! Please provide:

- A clear description of the proposed feature
- Use cases and benefits
- Potential implementation approach (if known)

Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md) for feature suggestions.

### Pull Requests

We welcome pull requests! Here's the process:

1. **Fork the repository** from GitHub
2. **Create a branch** for your feature or bug fix
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
3. **Make your changes** following the code style guidelines
4. **Write tests** for your changes
5. **Ensure all tests pass**
   ```bash
   npm test
   ```
6. **Run type checking**
   ```bash
   npm run typecheck
   ```
7. **Build the project**
   ```bash
   npm run build
   ```
8. **Commit your changes** with a clear commit message
   ```
   ✨feat: add new feature description
   - detail 1
   - detail 2
   ```
9. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```
10. **Create a Pull Request** to the main branch

Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) when creating pull requests.

## Code Style

- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Write tests for new features and bug fixes

## Testing

- All new features must include tests
- Maintain test coverage above 80%
- Use Vitest for unit tests
- Write integration tests for complex workflows

## Development Setup

1. Clone the repository
   ```bash
   git clone https://github.com/swarmflow/swarmflow.git
   cd swarmflow
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Build the project
   ```bash
   npm run build
   ```

4. Run tests
   ```bash
   npm test
   ```

## Questions?

Feel free to open an issue for questions or discussions about the project.
