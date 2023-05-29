import Router from "express-promise-router";
import {vRisingServer} from "../../v-rising/server.js";
import {ensureAdmin} from "./utils.js";
import {logger} from "../../logger.js";

const router = Router();


router.post('/start', ensureAdmin, async (req, res) => {
    if (vRisingServer.serverInfo.serverSetupComplete) return res.json(vRisingServer.serverInfo);
    res.json(await vRisingServer.startServer(req.config, true));
});

router.get('/info', async (req, res) => {
    await res.json(vRisingServer.serverInfo);
});

router.post('/force-stop', ensureAdmin, async (req, res) => {
    if (!vRisingServer.serverInfo.serverSetupComplete) return res.json(vRisingServer.serverInfo);
    res.json(await vRisingServer.stopServer(true));
});

router.post('/scheduled-stop', ensureAdmin, async (req, res) => {
    const {delay} = req.body;
    logger.info('Received scheduled stop with delay %d minutes', delay);

    const serverInfo = await vRisingServer.scheduleStop(delay, req.user);

    res.json(serverInfo);
});

router.post('/scheduled-restart', ensureAdmin, async (req, res) => {
    const {delay} = req.body;
    logger.info('Received scheduled restart with delay %d minutes', delay);

    const serverInfo = await vRisingServer.scheduleRestart(delay, req.user);

    res.json(serverInfo);
});

router.post('/stop-scheduled-operation', ensureAdmin, async (req, res) => {
    logger.info('Stopping current scheduled operation');
    const serverInfo = await vRisingServer.stopScheduledOperation(req.user);
    res.json(serverInfo);
});

export default router;
