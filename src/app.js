import { route, startRouter } from './router.js';
import { mountHome } from './pages/home.js';
import { mountCreate } from './pages/create.js';
import { mountTemplate } from './pages/template.js';
import { mountHost } from './pages/host.js';
import { mountPlay } from './pages/play.js';

route('/', mountHome);
route('/create', mountCreate);
route('/t/:templateId', (el, p) => mountTemplate(el, p.templateId));
route('/host/:code', (el, p) => mountHost(el, p.code));
route('/play/:code', (el, p) => mountPlay(el, p.code));

startRouter();
