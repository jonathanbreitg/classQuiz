import { route, startRouter } from './router.js';
import { mountHome } from './pages/home.js';
import { mountCreate, mountEdit } from './pages/create.js';
import { mountTemplate } from './pages/template.js';
import { mountHost } from './pages/host.js';
import { mountPlay } from './pages/play.js';

route('/', mountHome);
route('/create', (el) => mountCreate(el));
route('/edit/:templateId', (el, p) => mountEdit(el, p.templateId));
route('/t/:templateId', (el, p) => mountTemplate(el, p.templateId));
route('/host/:code', (el, p) => mountHost(el, p.code));
route('/play/:code', (el, p) => mountPlay(el, p.code));

startRouter();
