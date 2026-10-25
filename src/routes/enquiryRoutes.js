const express = require('express');
const router = express.Router();
const enquiryController = require('../controllers/enquiryController');
const { authenticate } = require('../middleware/auth');
router.use(authenticate);

// 1. Create a customer enquiry
router.post('/', enquiryController.createEnquiry);

// 2 & 4. Retrieve all enquiries (and filter by ?status=)
router.get('/', enquiryController.getAllEnquiries);

// 3. Retrieve one enquiry by ID
router.get('/:id', enquiryController.getEnquiryById);

// 5. Update an enquiry's status
router.patch('/:id/status', enquiryController.updateEnquiryStatus);

// 6. Delete an enquiry
router.delete('/:id', enquiryController.deleteEnquiry);

module.exports = router;
