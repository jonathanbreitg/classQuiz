import { navigate } from '../router.js';
import { icon } from '../lib/icons.js';

export function mountHome(container) {
  container.innerHTML = `
    <div class="page home">
      <div class="home__logo">ClassQuiz</div>
      <p class="home__tagline">Fast vocab games for the classroom</p>

      <div class="home__join">
        <input
          id="code-input"
          class="input input--code"
          type="text"
          maxlength="4"
          placeholder="ABCD"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
        >
        <button id="join-btn" class="btn btn--primary btn--full btn--lg">Join Game</button>
      </div>

      <div class="home__divider">or</div>

      <div class="home__create">
        <button id="create-btn" class="btn btn--secondary btn--full btn--lg">
          ${icon('pencil')} Create a game
        </button>
      </div>
    </div>
  `;

  const codeInput = container.querySelector('#code-input');
  const joinBtn = container.querySelector('#join-btn');
  const createBtn = container.querySelector('#create-btn');

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');
  });

  codeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') joinBtn.click();
  });

  joinBtn.addEventListener('click', () => {
    const code = codeInput.value.trim();
    if (code.length !== 4) {
      codeInput.focus();
      codeInput.style.borderColor = 'var(--danger)';
      setTimeout(() => { codeInput.style.borderColor = ''; }, 1200);
      return;
    }
    navigate(`/play/${code}`);
  });

  createBtn.addEventListener('click', () => navigate('/create'));
}
