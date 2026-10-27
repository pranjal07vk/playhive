import { Router } from 'express';
import { health } from '../controllers/healthController.js';

export default Router().get('/', health);
