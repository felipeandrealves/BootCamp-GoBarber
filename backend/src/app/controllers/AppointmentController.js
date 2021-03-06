import * as Yup from 'yup';
import {
    startOfHour,
    parseISO,
    isBefore,
    format,
    startOfDay,
    endOfDay,
    subHours,
} from 'date-fns';
import pt from 'date-fns/locale/pt';
import { Op } from 'sequelize';
import User from '../models/User';
import File from '../models/File';
import Appointment from '../models/Appointment';
import Notification from '../schemas/Notification';
import Queue from '../../lib/Queue';

import CancelationMail from '../jobs/CancellationMail';

class AppointmentController {
    async index(req, res) {
        const { page = 1 } = req.query;

        const appointments = await Appointment.findAll({
            where: { user_id: req.userId, canceled_at: null },
            order: ['date'],
            attributes: ['id', 'date', 'past', 'cancelable'],
            limit: 20,
            offset: (page - 1) * 20,
            include: [
                {
                    model: User,
                    as: 'provider',
                    attributes: ['id', 'name'],
                    include: [
                        {
                            model: File,
                            as: 'avatar',
                            attributes: ['id', 'path', 'url'],
                        },
                    ],
                },
            ],
        });

        return res.json(appointments);
    }

    async store(req, res) {
        const schema = Yup.object().shape({
            provider_id: Yup.number().required(),
            date: Yup.date().required(),
        });

        if (!(await schema.isValid(req.body))) {
            return res.status(400).json({ error: 'Validation Fail!!!' });
        }

        const { provider_id, date } = req.body;

        if (provider_id === req.userId) {
            return res.status(400).json({
                error: 'You can not create a appointment with yourself!!!',
            });
        }

        const isProvider = await User.findOne({
            where: {
                id: provider_id,
                provider: true,
            },
        });

        if (!isProvider) {
            return res.status(400).json({
                error: 'You can only create appointments with providers!!!',
            });
        }

        const hourStart = startOfHour(parseISO(date));

        if (isBefore(hourStart, new Date())) {
            return res
                .status(400)
                .json({ error: 'Past date are not permited!!!' });
        }

        const checkAvailability = await Appointment.findOne({
            where: {
                provider_id,
                canceled_at: null,
                date: hourStart,
            },
        });

        if (checkAvailability) {
            return res
                .status(400)
                .json({ error: 'Appointment date not available!!!' });
        }

        const parsedDate = parseISO(date);

        const checkUserHaveAppointment = await Appointment.findOne({
            where: {
                user_id: req.userId,
                canceled_at: null,
                date: {
                    [Op.between]: [
                        startOfDay(parsedDate),
                        endOfDay(parsedDate),
                    ],
                },
            },
            order: ['date'],
        });

        if (checkUserHaveAppointment) {
            return res.status(400).json({
                error: 'You already have a appointment that day!!!',
            });
        }

        const appointment = await Appointment.create({
            user_id: req.userId,
            provider_id,
            date: hourStart,
        });

        const user = await User.findByPk(req.userId);

        const formattedDate = format(
            hourStart,
            "'dia' dd 'de' MMMM', ás' H:mm'h'",
            { locale: pt }
        );

        await Notification.create({
            content: `Novo agendamento de ${user.name} para ${formattedDate}`,
            user: provider_id,
        });

        return res.json(appointment);
    }

    async delete(req, res) {
        const appointment = await Appointment.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: 'provider',
                    attributes: ['name', 'email'],
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['name'],
                },
            ],
        });

        if (appointment.user_id !== req.userId) {
            return res.status(401).json({
                error:
                    "You don't have permission to cancel this appointment!!!",
            });
        }

        const dateWithSub = subHours(appointment.date, 2);

        if (isBefore(dateWithSub, new Date())) {
            return res.status(401).json({
                error: 'You can only cancel appointment 2 hours in advance!!!',
            });
        }

        if (appointment.canceled_at !== null) {
            return res
                .status(401)
                .json({ error: 'This appointment Already canceled!!!' });
        }

        appointment.canceled_at = new Date();

        await appointment.save();

        await Queue.add(CancelationMail.key, {
            appointment,
        });

        return res.json(appointment);
    }
}

export default new AppointmentController();
