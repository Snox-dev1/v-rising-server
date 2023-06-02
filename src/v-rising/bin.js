import * as os from "os";
import {logger} from "../logger.js";
import path from "path";
import {spawn, execFile} from 'child_process';
import fs from "fs";
import {waitForFile} from "./utils.js";
import pino from 'pino';
import pretty from 'pino-pretty';

const processLogStream = pretty({
    colorize: true,
    destination: './logs/process-logs.log'
});

export const startVRisingServerExecution = async (config, vRisingServer) => {
    const platform = os.platform();

    const fullExeFilePath = path.join(config.server.serverPath, config.server.exeFileName);

    if (fs.existsSync(config.server.logFile)) {
        logger.info('Deleting server log file %s', config.server.logFile);
        fs.unlinkSync(config.server.logFile);
    }

    const options = {};

    const processLogger = pino({level: 'info'}, processLogStream);

    return new Promise(async (resolve, reject) => {
        switch (platform) {
            case 'win32':
                logger.debug('Starting VRising server on win32 platform with file path %s and args %j', fullExeFilePath, args);
                vRisingServer.serverProcess = spawn(fullExeFilePath, [
                    '-persistentDataPath', config.server.dataPath,
                    '-serverName', config.server.name,
                    '-saveName', config.server.saveName,
                    '-logFile', config.server.logFile,
                    config.server.gamePort,
                    config.server.queryPort
                ], options);
                break;
            case 'linux':
                const linuxArgs = [
                    '-p', config.server.dataPath,
                    '-s', config.server.serverPath,
                    '--name', config.server.name,
                    '--save', config.server.saveName,
                    '-l', config.server.logFile,
                    config.server.gamePort,
                    config.server.queryPort
                ];
                logger.info('Starting VRising server on linux platform with args %j', linuxArgs);
                vRisingServer.serverProcess = spawn('./start.sh', linuxArgs, {
                    env: process.env
                });
                break;
            default:
                throw new Error('Cannot start VRising server on a platform that is not win32 or linux');
        }

        logger.info('Spawned server process with pid %d', vRisingServer.serverProcess.pid);

        vRisingServer.serverProcess.stdout.on('data', (chunk) => processLogger.info('%s', chunk));
        vRisingServer.serverProcess.stderr.on('data', (chunk) => processLogger.error('%s', chunk));

        vRisingServer.serverProcess.on('message', message => logger.info('Server Message: %s', message));
        vRisingServer.serverProcess.on('exit', async (code) => {
            vRisingServer.apiClient.stopPollingMetrics();
            if (code !== 0) {
                reject(new Error(`Command encountered exited with code ${code}`))
            } else {
                logger.info('Server process exited with no error');
                if (!vRisingServer.serverInfo.isSaveLoaded) {
                    reject(new Error(`Server process exited without loading a save !`));
                }
            }
        });
        vRisingServer.serverProcess.on("error", error => reject(error));

        await vRisingServer.listenToServerProcess();

        logger.debug('Waiting for log file %s', config.server.logFile);
        const fileExists = await waitForFile(config.server.logFile, 120000);

        if (fileExists) {
            logger.debug('Log file is ready to be parsed : %s', config.server.logFile);
            vRisingServer.startWatchingLogFile();
        } else {
            logger.error('Log file does not exists !');
        }

        vRisingServer.once('ready', async (serverInfo) => {
            resolve(serverInfo);
        });
    });
};

export const stopVRisingServerExecution = async (vRisingServer) => {
    if (!vRisingServer.serverProcess) return;

    logger.info('Stopping VRising server process');

    return new Promise(async (resolve, reject) => {
        vRisingServer.serverProcess.once('exit', async () => {
            if (os.platform() === "linux") {
                await new Promise((ok, nok) => {
                    logger.debug("Use stop_server.sh");
                    execFile('./stop_server.sh', (err, data) => {
                        if (err) nok(err);
                        ok(data);
                    });
                })
            }

            vRisingServer.stopWatchingLogFile();
            vRisingServer.clearServerInfo();
            vRisingServer.serverProcess = null;
            resolve(vRisingServer.getServerInfo());
        });

        vRisingServer.serverProcess.once('error', (err) => reject(err));

        vRisingServer.serverProcess.kill('SIGTERM');
    })
};

export const getServerProcessPid = async (vRisingServer) => {
    return vRisingServer.retrieveProcessPid();
}
