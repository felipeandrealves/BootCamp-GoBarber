import { Router } from 'express';
import multer from 'multer';
import multerConfig from './config/multer';

import UserController from './app/controllers/UserController';
import SessionController from './app/controllers/SessionController';
import FileController from './app/controllers/FileConteroller';
import ProviderController from './app/controllers/ProviderController';
import AppointmentController from './app/controllers/AppointmentController';
import NotificationController from './app/controllers/NotificationController';
import AvailableController from './app/controllers/AvailableController';

import authMiddleware from './app/middlewares/auth';
import ScheduleController from './app/controllers/ScheduleController';

const routes = new Router();
const upload = multer(multerConfig);

routes.post('/users', UserController.store);

routes.post('/sessions', SessionController.store);

routes.use(authMiddleware);

routes.put('/users', UserController.update);

routes.post('/files', upload.single('file'), FileController.store);

routes.get('/providers', ProviderController.index);

routes.get('/providers/:providerId/available', AvailableController.index);

routes.get('/appointment', AppointmentController.index);

routes.post('/appointment', AppointmentController.store);

routes.delete('/appointment/:id', AppointmentController.delete);

routes.get('/schedule', ScheduleController.index);

routes.get('/notifications', NotificationController.index);

routes.put('/notifications/:id', NotificationController.update);

export default routes;
