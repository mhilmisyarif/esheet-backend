const technicianService = require('./technician.service');

const getTechnicians = async (req, res, next) => {
    try {
        const technicians = await technicianService.getAllTechnicians(req.query);
        res.status(200).json({
            success: true,
            message: 'Technicians retrieved successfully',
            data: technicians,
        });
    } catch (error) {
        next(error);
    }
};

const getTechnicianById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const technician = await technicianService.getTechnicianById(id);

        if (!technician) {
            return res.status(404).json({
                success: false,
                message: 'Technician not found',
            });
        }

        res.status(200).json({
            success: true,
            data: technician,
        });
    } catch (error) {
        next(error);
    }
};

const createTechnician = async (req, res, next) => {
    try {
        const newTechnician = await technicianService.createTechnician(req.body);
        res.status(201).json({
            success: true,
            message: 'Technician created successfully',
            data: newTechnician,
        });
    } catch (error) {
        next(error);
    }
};

const updateTechnician = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updatedTechnician = await technicianService.updateTechnician(id, req.body);
        res.status(200).json({
            success: true,
            message: 'Technician updated successfully',
            data: updatedTechnician,
        });
    } catch (error) {
        next(error);
    }
};

const deleteTechnician = async (req, res, next) => {
    try {
        const { id } = req.params;
        await technicianService.deleteTechnician(id);
        res.status(200).json({
            success: true,
            message: 'Technician deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTechnicians,
    getTechnicianById,
    createTechnician,
    updateTechnician,
    deleteTechnician,
};