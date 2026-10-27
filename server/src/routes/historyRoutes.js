import { Router } from 'express';
import * as history from '../controllers/historyController.js';

// Express 4 does not forward rejected promises, so wrap async handlers.
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

export default Router().get('/', wrap(history.recent)).get('/:id', wrap(history.getMatch));
