import express from "express";
import { MongoClient } from "mongodb";
import cors from "cors";
import joi from "joi";
import dotenv from "dotenv"
import dayjs from "dayjs"

const app = express();
dotenv.config();
app.use(express.json());
app.use(cors());
dotenv.config();
const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
await mongoClient.connect();
db = mongoClient.db()
} catch (err) {console.log("Data bank error", err.message);}

const port = 5000;
app.listen(port,()=> console.log(`Server running in port: ${port}`));

app.post("/messages", async (req, res) => {
    const { user } = req.headers
    const { to, text, type } = req.body
    if (!user || typeof user !== "string") return res.sendStatus(422);
    const SchemaMessage = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.valid("private_message", "message").required()
    })
    const validateMessage = SchemaMessage.validate({ to, text, type }, 
        { abortEarly: false })
    if (validateMessage.error) {
        const erros = validateMessage.error.details.map((err) => err.message)
        return res.status(422).send(erros)
    }

        const receiver = await db.collection("participants").findOne({ name: user })
        if (!receiver) return res.status(422)
        const messages = db.collection("messages").insertOne({
            from: user,
            to,
            text,
            type,
            time: dayjs().format("HH:mm:ss")
        })
        res.status(201).send(messages)
})

app.get("/messages", async (req, res) => {
    const { user } = req.headers
    const limit = req.query.limit ? parseInt(req.query.limit) : false
    const filter = {
        $or: [
            {type: "private_message",
             from: user
            },
            {
                type: "private_message",
                to: user
            },
            { type: "message" },
            { type: "status" }
        ]
    };
    const messages = await db.collection("messages").find(filter).toArray()
    if (limit < 0 || limit === 0 || isNaN(limit)) {
        return res.sendStatus(422)
    } else if (limit > 0) {
        return res.send(messages.slice(-limit).reverse())
    } else {
        res.send(messages.reverse())
    }
})

app.post("/participants", async (req, res) => {
    const { name } = req.body
    const Schema = joi.object({
        name: joi.string().required()
    })
    const nameValidation = Schema.validate({ name }, { abortEarly: false })
    if (nameValidation.error) {
        const erros = nameValidation.error.details.map((err) => err.message)
        return res.status(422).send(erros)
    }
    
        const findUser = await db.collection("participants").findOne({ name })
        if (findUser) {
            return res.sendStatus(409)
        }
        await db.collection("participants").insertOne({ name, lastStatus: Date.now() })
        await db.collection("messages").insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss")
        })  
        res.sendStatus(201)
})

app.get("/participants", async (req, res) => {
    {
        const onlineUsers = await db.collection("participants").find().toArray()
        res.send(onlineUsers)
    }
})

app.post("/status", async (req, res) => {
    const { user } = req.headers
    const Online = await db.collection("participants").findOne({ name: user })
        if (!Online) {
            return res.sendStatus(404)
        }
        await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() } })
        res.sendStatus(200)
    
})

    // Remo????o de Usu??rios Inativos e Manuten????o de Ativos

    const collections = {
        participants: "participants",
        messages: "messages"
      };
    
    const clock = () => {
        const hour = (dayjs().hour()).toLocaleString("pt-br", { minimumIntegerDigits: 2 });
        const minute = (dayjs().minute()).toLocaleString("pt-br", { minimumIntegerDigits: 2 });
        const second = (dayjs().second()).toLocaleString("pt-br", { minimumIntegerDigits: 2 });
        return `${hour}:${minute}:${second}`;
      };

    const generateDeleteMessage = (from) => {
    const deleteMessage = {
      from,
      text: "sai da sala...",
        to: "todos",
        time: clock(),
        type: "status"
        };
      
        return deleteMessage;
      };

    setInterval(async () => {
        const statusLimit = Date.now() - (10000);
        const deleteParticipant = await db.collection(collections.participants).find({ lastStatus: { $lt: statusLimit } }).toArray();
        deleteParticipant.forEach(async participant => {
          await db.collection(collections.messages).insertOne(generateDeleteMessage(participant.name));
        });
        await db.collection(collections.participants).deleteMany({ lastStatus: { $lt: statusLimit } });
      
      }, 15000);    