import { renderSpytialGdls } from '../../src/markdown.js';

// MkDocs handles navigation, search, and Markdown. GDL supplies the live embeds.
const article = document.querySelector('.md-content__inner');
if (article) {
  try {
    await renderSpytialGdls(article, { height: 280, sourceOpen: true });
  } catch (error) {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = `Could not load live diagrams: ${error.message}`;
    article.append(message);
  }
}
