require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();

// Middleware
app.use(cors());
app.use(express.json()); 
app.use(bodyParser.json()); 

const PORT = process.env.PORT || 3000;

// ✅ Default route for testing
app.get("/", (req, res) => {
    res.send("Hello, World! Your server is running.");
});

// ✅ Identify Route
app.post("/identify", async (req, res) => {
    try {
        console.log("Incoming Request Body:", req.body); 

        const { email, phoneNumber } = req.body;

        if (!email && !phoneNumber) {
            return res.status(400).json({ error: "Either email or phoneNumber is required" });
        }

        // Find all related contacts
        const contacts = await prisma.contact.findMany({
            where: {
                OR: [{ email }, { phoneNumber }],
            },
        });

        if (contacts.length === 0) {
            // No existing contact found, create a new primary contact
            const newContact = await prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkPrecedence: "primary",
                },
            });

            return res.json({
                contact: {
                    primaryContactId: newContact.id,
                    emails: [newContact.email].filter(Boolean),
                    phoneNumbers: [newContact.phoneNumber].filter(Boolean),
                    secondaryContactIds: [],
                },
            });
        }

        // Identify the primary contact
        let primaryContact = contacts.find((c) => c.linkPrecedence === "primary");
        if (!primaryContact) {
            primaryContact = contacts[0];
        }

        // Collect all linked contacts
        const allContacts = await prisma.contact.findMany({
            where: {
                OR: [{ linkedId: primaryContact.id }, { id: primaryContact.id }],
            },
        });

        // Check if the request has new data
        const existingEmails = new Set(allContacts.map((c) => c.email).filter(Boolean));
        const existingPhones = new Set(allContacts.map((c) => c.phoneNumber).filter(Boolean));

        let newSecondaryContact = null;

        if ((email && !existingEmails.has(email)) || (phoneNumber && !existingPhones.has(phoneNumber))) {
            console.log("Checking if contact already exists before creating secondary contact...");

            // Ensure the new contact is not already in the database
            const existingContact = await prisma.contact.findFirst({
                where: {
                    OR: [
                        { email: email || undefined },
                        { phoneNumber: phoneNumber || undefined }
                    ],
                },
            });

            if (!existingContact) {
                console.log("Creating new secondary contact...");
                newSecondaryContact = await prisma.contact.create({
                    data: {
                        email,
                        phoneNumber,
                        linkedId: primaryContact.id,
                        linkPrecedence: "secondary",
                    },
                });
            } else {
                console.log("Duplicate email/phone detected, skipping creation.");
            }
        }

        // Get updated contacts after adding new secondary contact
        const updatedContacts = await prisma.contact.findMany({
            where: {
                OR: [{ linkedId: primaryContact.id }, { id: primaryContact.id }],
            },
        });

        return res.json({
            contact: {
                primaryContactId: primaryContact.id,
                emails: [...new Set(updatedContacts.map((c) => c.email).filter(Boolean))],
                phoneNumbers: [...new Set(updatedContacts.map((c) => c.phoneNumber).filter(Boolean))],
                secondaryContactIds: updatedContacts.filter((c) => c.linkPrecedence === "secondary").map((c) => c.id),
            },
        });
    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});

// ✅ Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
