import axios from 'axios';
import moment from "moment";
import { protocolErrorMessages } from './errorSchemas.js';
import { resolveQueriesToAttempt } from './resolutions.js';
import { monitorVersion, ProtocolTypeEntityName, sleep, colorsArray } from './util.js';
import { getGithubIssues, postGithubIssue } from './github.js';
// Error handling functions

export async function errorNotification(error, channelId = process.env.CHANNEL_ID) {
    await sleep(5000);
    try {
        const baseURL = "https://discordapp.com/api/channels/1019063880040861806/messages";
        const headers = {
            "Authorization": "Bot " + process.env.BOT_TOKEN,
            "Content-Type": "application/json",
        }
        const postJSON = JSON.stringify({ "content": `**Subgraph Bot Monitor from ${process.env.CHANNEL_ID} on Channel ${channelId}- Errors detected**\n` + error });
        console.log(postJSON)
        // const data = await axios.post(baseURL, postJSON, { "headers": { ...headers } });
        return null;
    } catch (err) {
        errorNotification("ERROR LOCATION 6 " + err.message);
    }
}

// Functions involved in fetching messages/channels

export async function getDiscordMessages(messages, channelId = process.env.CHANNEL_ID) {
    try {
        const tempMessages = await fetchMessages(messages[messages.length - 1]?.id || "", channelId);
        if (!tempMessages) {
            return [];
        }
        messages = [...messages, ...tempMessages];
        if (messages.length % 100 === 0 && messages.length !== 0 && tempMessages.length !== 0) {
            await sleep(1000);
            return getDiscordMessages(messages, channelId);
        } else {
            return messages;
        }
    } catch (err) {
        errorNotification("ERROR LOCATION 7 " + err?.message + ' URL: ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }
}

export async function fetchMessages(before, channelId = process.env.CHANNEL_ID) {
    let beforeQueryParam = "";
    if (before) {
        beforeQueryParam = "&before=" + before;
    }
    const baseURL = "https://discordapp.com/api/channels/" + channelId + "/messages?limit=100" + beforeQueryParam;
    const headers = {
        "Authorization": "Bot " + process.env.BOT_TOKEN,
        "Content-Type": "application/json",
    }
    try {
        const data = await axios.get(baseURL, { "headers": { ...headers } });
        return data.data;
    } catch (err) {
        errorNotification("ERROR LOCATION 8 " + err?.message + ' URL: ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
        return [];
    }
}

export async function getChannel(channelId = process.env.CHANNEL_ID) {
    let baseURL = "https://discordapp.com/api/channels/" + channelId;
    const headers = {
        "Authorization": "Bot " + process.env.BOT_TOKEN,
        "Content-Type": "application/json",
    }

    try {
        const data = await axios.get(baseURL, { "headers": { ...headers } });
        return data.data;
    } catch (err) {
        errorNotification("ERROR LOCATION 9 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }
}

// functions involved with deleting messages/threads/channels

export async function clearChannel(channelId) {
    // This function is called to clear the main channel of all threads within it
    try {
        const msgs = await getDiscordMessages([], channelId);
        const baseURL = "https://discordapp.com/api/channels/";
        const headers = {
            "Authorization": "Bot " + process.env.BOT_TOKEN,
            "Content-Type": "application/json",
        }

        const deletions = msgs.map(msg => {
            return axios.delete(baseURL + msg.id, { "headers": { ...headers } }).catch(err => console.log(err.message));
        });

        await Promise.allSettled(deletions);
        clearMessages(channelId);
    } catch (err) {
        errorNotification("ERROR LOCATION 10 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }
}

export async function clearMessages(channelId) {
    // This function is called to clear all the messages within a thread or channel
    // Note that this does not delete threads but only the message which heads the thread
    try {
        const msgs = await getDiscordMessages([], channelId);
        const baseURL = "https://discordapp.com/api/channels/" + channelId;
        const headers = {
            "Authorization": "Bot " + process.env.BOT_TOKEN,
            "Content-Type": "application/json",
        }
        const messages = msgs.map(x => x.id).slice(0, 100);
        const postJSON = JSON.stringify({ "messages": messages });
        if (messages.length > 1) {
            await axios.post(baseURL + "/messages/bulk-delete", postJSON, { "headers": { ...headers } });
        } else if (messages.length === 1) {
            deleteSingleMessage(messages[0], channelId);
        }
    } catch (err) {
        errorNotification("ERROR LOCATION 11 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }
}

export async function getAllThreadsToClear(deleteMsgsFromBeforeTS, channelId) {
    const msgs = await getDiscordMessages([], channelId);
    msgs.push({ id: process.env.PROD_CHANNEL });
    await clearAllThreads(msgs, deleteMsgsFromBeforeTS);
}

export async function clearAllThreads(msgs, deleteMsgsFromBeforeTS) {
    // Take the first 5 queries to attempt
    let useMsgs = msgs.slice(0, 5);
    const newMsgsArray = [...msgs.slice(5)];
    try {
        await Promise.allSettled(useMsgs.map(msg => clearThread(deleteMsgsFromBeforeTS, msg.id)));
    } catch (err) {
        errorNotification("ERROR LOCATION 23 " + err.message);
    }
    await sleep(5000);
    if (newMsgsArray.length > 0) {
        clearAllThreads(newMsgsArray, deleteMsgsFromBeforeTS);
        return;
    }
    return;
}

export async function clearThread(deleteMsgsFromBeforeTS, channelId) {
    // This function is called to clear all the messages within a provided thread(channel)
    // Delete all messages (except fr head message) older than 7d
    let messages = []
    try {
        const msgs = await getDiscordMessages([], channelId);
        const baseURL = "https://discordapp.com/api/channels/" + channelId;
        const headers = {
            "Authorization": "Bot " + process.env.BOT_TOKEN,
            "Content-Type": "application/json",
        }

        const timeAgo = new Date(deleteMsgsFromBeforeTS)
        messages = msgs.filter(x => moment(new Date(x.timestamp)).isSameOrBefore(timeAgo)).map(x => x.id).slice(0, 100)
        messages.pop();
        if (messages.length === 1) {
            deleteSingleMessage(messages[0], channelId);
            return;
        }
        if (messages.length === 0) {
            return;
        }
        const postJSON = JSON.stringify({ "messages": messages });
        await axios.post(baseURL + "/messages/bulk-delete", postJSON, { "headers": { ...headers } });
    } catch (err) {
        if (err?.response?.data?.message?.includes("Thread is archived")) {
            console.log('unarchive thread', channelId);
            await unarchiveThread(channelId);
            return await clearThread(deleteMsgsFromBeforeTS, channelId);
        }
        if (err.response.status === 400 && messages.length === 1) {
            deleteSingleMessage(messages[0], channelId);
        }
        errorNotification("ERROR LOCATION 24 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }
}

export async function deleteSingleMessage(messageId, channelId = process.env.CHANNEL_ID) {
    try {
        const headers = {
            "Authorization": "Bot " + process.env.BOT_TOKEN,
            "Content-Type": "application/json",
        };
        const baseURL = "https://discordapp.com/api/channels/" + channelId + "/messages/" + messageId;
        await axios.delete(baseURL, { "headers": { ...headers } });
        return;
    } catch (err) {
        if (err?.response?.data?.message?.includes("Thread is archived")) {
            console.log('unarchive thread', channelId);
            await unarchiveThread(channelId);
            return await deleteSingleMessage(messageId, channelId);
        }
        errorNotification("ERROR LOCATION 22 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }
}

// Message Posting functions

let colorIndex = 0;
export async function sendDiscordMessage(messageObjects, protocolName, channelId = process.env.CHANNEL_ID) {
    if (messageObjects?.length === 0 || !messageObjects) {
        return null;
    }
    const baseURL = "https://discordapp.com/api/channels/" + channelId + "/messages";
    const headers = {
        "Authorization": "Bot " + process.env.BOT_TOKEN,
        "Content-Type": "application/json",
    }

    let color = 0x32CD32;
    colorIndex += 1;
    if (colorIndex < colorsArray.length) {
        color = colorsArray[colorIndex];
    } else {
        color = colorsArray[colorIndex % colorsArray.length]
    }

    messageObjects = messageObjects.map(x => {
        x.color = color;
        return x;
    });

    const postJSON = JSON.stringify({ "content": `**Subgraph Bot Monitor - Errors detected on ${protocolName}**\n`, "embeds": messageObjects });
    try {
        const data = await axios.post(baseURL, postJSON, { "headers": { ...headers } });
        return data;

        // Code that saves the embed json rather than sending it, when testing/debugging main channel
        // const nowDate = new Date().getMonth().toString() + '-' + new Date().getDate().toString() + '-' + new Date().getFullYear().toString();
        // const jsonPath = path.join(process.cwd(), 'alerts_' + nowDate + '_' + protocolName + '.json');
        // fs.writeFileSync(jsonPath, JSON.stringify(messageObjects, null, '\t'));
        // return null;
    } catch (err) {
        if (err.response.status === 429) {
            return messageObjects;
        } else {
            errorNotification("ERROR LOCATION 12 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
            return null;
        }
    }
}

export async function startProtocolThread(subject, base, channelId = process.env.CHANNEL_ID) {
    let baseURL = "https://discordapp.com/api/channels/" + channelId + "/messages";
    const headers = {
        "Authorization": "Bot " + process.env.BOT_TOKEN,
        "Content-Type": "application/json",
    }

    let postJSON = JSON.stringify({ "content": subject + ' (Base: ' + base + ')' });
    if (base === '') {
        postJSON = JSON.stringify({ "content": subject });
    }
    let msgId = "";
    try {
        const data = await axios.post(baseURL, postJSON, { "headers": { ...headers } });
        msgId = data.data.id;
    } catch (err) {
        errorNotification("ERROR LOCATION 13 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }

    baseURL = "https://discordapp.com/api/channels/" + channelId + "/messages/" + msgId + "/threads";

    postJSON = JSON.stringify({ "name": subject + ' ISSUES' });
    if (base === '') {
        postJSON = JSON.stringify({ "name": subject });
    }

    try {
        const data = await axios.post(baseURL, postJSON, { "headers": { ...headers } });
        return { channel: data.data.id, protocolName: subject };
    } catch (err) {
        if (!!msgId) {
            deleteSingleMessage(msgId, channelId);
        }
        errorNotification("ERROR LOCATION 14 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }
}

export async function unarchiveThread(channelId = process.env.CHANNEL_ID) {
    // This function sends a message to an archived thread, thereby unarchiving it, then deleting this message
    let baseURL = "https://discordapp.com/api/channels/" + channelId + "/messages";
    const headers = {
        "Authorization": "Bot " + process.env.BOT_TOKEN,
        "Content-Type": "application/json",
    };

    let postJSON = JSON.stringify({ "content": 'UNARCHIVE THREAD' });
    let msgId = "";
    try {
        const data = await axios.post(baseURL, postJSON, { "headers": { ...headers } });
        msgId = data.data.id;
        await deleteSingleMessage(msgId, channelId);
    } catch (err) {
        errorNotification("ERROR LOCATION 25 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message, channelId);
    }
}

export function constructEmbedMsg(protocol, deploymentsOnProtocol, issuesOnThread, indexDeploymentIssues) {
    try {
        const embedObjects = [];
        const indexingErrorEmbed = {
            title: "Indexing Errors",
            description: 'These subgraphs encountered a fatal error in indexing',
            fields: [{ name: 'Chain', value: '\u200b', inline: true }, { name: 'Failed At Block', value: '\u200b', inline: true }, { name: '\u200b', value: '\u200b', inline: false }],
            footer: { text: monitorVersion }
        };

        const placeholderColor = colorsArray[Math.floor(Math.random() * 8)];
        const indexErrorEmbedDepos = {};
        const indexErrorPendingHash = {};
        const prodStatusDepoMapping = {};
        const aggThreadProtocolErrorEmbeds = [];
        const aggThreadIndexErrorEmbeds = JSON.parse(JSON.stringify([...indexingErrorEmbed.fields]));
        let zapierProdThreadIndexing = [];
        let zapierProdThreadProtocols = {};
        deploymentsOnProtocol.forEach((depo) => {
            let networkString = depo.network;
            if (depo.status === 'prod') {
                prodStatusDepoMapping[networkString] = true;
            }
            let issuesSet = [];
            const protocolErrorEmbed = {
                title: `Protocol Level Errors on ${protocol}`,
                color: placeholderColor,
                description: 'After mapping through all of the subgraph deployments for this protocol, The errors listed in this section were detected within protocol level data.',
                fields: [],
                footer: { text: monitorVersion }
            };
            if (!!issuesOnThread) {
                issuesSet = issuesOnThread[networkString];
                if (depo.pending) {
                    issuesSet = issuesOnThread[networkString + '-pending'];
                    networkString += ' (PENDING)';
                }
            }
            protocolErrorEmbed.title = `Protocol Level Errors on ${protocol}-${networkString}`;
            if (!!depo.indexingError) {
                const messagesAfterTS = new Date(Date.now() - ((86400000 * 1)));
                let issueHasBeenAlerted = false;
                if (!!depo.pending) {
                    issueHasBeenAlerted = (indexDeploymentIssues.find(x => x.chain.includes(networkString.split(' ')[0] + "-PENDING") && x.indexed.includes(depo?.indexingError?.toString()) && moment(new Date(x.timestamp)).isSameOrAfter(messagesAfterTS)) || false);
                } else {
                    issueHasBeenAlerted = (indexDeploymentIssues.find(x => x.chain.includes(networkString) && x.indexed.includes(depo?.indexingError?.toString()) && moment(new Date(x.timestamp)).isSameOrAfter(messagesAfterTS)) || false);
                }
                if (!issueHasBeenAlerted) {
                    indexingErrorEmbed.color = placeholderColor;
                    indexErrorEmbedDepos[networkString] = { failureBlock: depo?.indexingError, message: depo?.indexingErrorMessage };
                    if (!!depo.pending) {
                        indexErrorPendingHash[networkString] = depo?.hash;
                    }
                }
            }
            let errorsOnDeployment = false;
            Object.entries(depo.protocolErrors).forEach(([errorType, errorArray], idx) => {
                if (issuesSet?.includes(errorType)) {
                    return;
                }
                const protocolRows = [];
                if (errorArray.length > 0) {
                    if (errorsOnDeployment === false) {
                        errorsOnDeployment = true;
                    }
                    errorArray.forEach((error) => {
                        protocolRows.push({ name: 'Field', value: errorType, inline: true }, { name: 'Value', value: error, inline: true }, { name: 'Description', value: protocolErrorMessages[errorType].split("'Protocol'").join(`${ProtocolTypeEntityName[depo.protocolType]}`).split('Value').join(error), inline: true }, { name: '\u200b', value: '\u200b', inline: false })
                    });
                }
                protocolErrorEmbed.fields = [...protocolErrorEmbed.fields, ...protocolRows];
            });
            if (protocolErrorEmbed.fields.length >= 3) {
                protocolErrorEmbed.url = `https://subgraphs.messari.io/subgraph?endpoint=${depo.url}&tab=protocol`;
                embedObjects.push(protocolErrorEmbed);
                if (depo?.status === 'prod') {
                    aggThreadProtocolErrorEmbeds.push(protocolErrorEmbed);
                    zapierProdThreadProtocols[networkString] = { Field: [], Value: [], Description: [] };
                    protocolErrorEmbed.fields.forEach((row) => {
                        if (row.name === 'Field') {
                            zapierProdThreadProtocols[networkString]['Field'].push(row.value);
                        } else if (row.name === 'Value') {
                            zapierProdThreadProtocols[networkString]['Value'].push(row.value);
                        } else if (row.name === 'Description') {
                            zapierProdThreadProtocols[networkString]['Description'].push(row.value);
                        }
                    })
                }
            }
        });
        if (Object.keys(indexErrorEmbedDepos)?.length > 0) {
            let labelValue = "";
            let failureBlock = "";

            Object.keys(indexErrorEmbedDepos)?.forEach(networkString => {
                const indexErrorObj = indexErrorEmbedDepos[networkString];
                let link = '';
                if (networkString.includes(' (PENDING')) {
                    link = `https://okgraph.xyz/?q=${indexErrorPendingHash[networkString]}`;
                    labelValue += `\n[${networkString.split(' ')[0]}-PENDING](${link})\n`;

                } else {
                    link = `https://okgraph.xyz/?q=messari%2F${protocol}-${networkString}`;
                    labelValue += `\n[${networkString}](${link})\n`;
                }
                failureBlock += '\n' + indexErrorObj.failureBlock + '\n';
                if (prodStatusDepoMapping[networkString] === true) {
                    aggThreadIndexErrorEmbeds[0].value += labelValue;
                    aggThreadIndexErrorEmbeds[1].value += failureBlock;
                    zapierProdThreadIndexing.push({ zappierMessage: `${networkString}: ${indexErrorObj.failureBlock}`, ghMessage: `${networkString}: Block #${indexErrorObj.failureBlock} - ${indexErrorObj.message}}\n` });
                }
            })
            indexingErrorEmbed.fields[0].value += labelValue;
            indexingErrorEmbed.fields[1].value += failureBlock;
            embedObjects.unshift(indexingErrorEmbed);
        }

        if (Object.keys(zapierProdThreadProtocols).length > 0 || zapierProdThreadIndexing.length > 0) {
            if (zapierProdThreadIndexing.length > 0) {
                sendMessageToZapierThread({ indexing: zapierProdThreadIndexing, protocolName: protocol });
            };
            if (Object.keys(zapierProdThreadProtocols).length > 0) {
                sendMessageToZapierThread({ protocol: zapierProdThreadProtocols, protocolName: protocol });
            }
        }

        if (embedObjects.length > 0) {
            let indexingErrorEmbedsToAggThread = [];
            if (aggThreadIndexErrorEmbeds[1].value.length > 3) {
                indexingErrorEmbedsToAggThread = aggThreadIndexErrorEmbeds;
            }
            aggThreadMsgObjects.push({ embeds: indexingErrorEmbedsToAggThread, protocol: protocol, protocolErrorEmbeds: aggThreadProtocolErrorEmbeds });
            return embedObjects;
        }
        return null;
    } catch (err) {
        errorNotification("ERROR LOCATION 15 " + err.message);
    }
}

let aggThreadMsgObjects = [];
export async function sendMessageToAggThread(aggThreadId = process.env.PROD_CHANNEL) {
    if (aggThreadMsgObjects.length === 0 || !aggThreadId) {
        return;
    }
    const aggThreadQueriesToResolve = [];
    const messagesAfterTS = new Date(Date.now() - ((86400000 * 1)));
    const currentThreadMessages = await fetchMessages("", aggThreadId);
    const baseURL = "https://discordapp.com/api/channels/" + aggThreadId + "/messages";
    const headers = {
        "Authorization": "Bot " + process.env.BOT_TOKEN,
        "Content-Type": "application/json",
    };
    aggThreadMsgObjects.forEach(aggThread => {
        let aggThreadMsgObjectsToSend = [];

        const indexingErrorEmbed = {
            title: "Indexing Errors " + aggThread.protocol,
            description: 'These subgraphs encountered a fatal error in indexing',
            fields: [{ name: 'Chain', value: '\u200b', inline: true }, { name: 'Failed At Block', value: '\u200b', inline: true }, { name: '\u200b', value: '\u200b', inline: false }],
            footer: { text: monitorVersion }
        };
        const msg = currentThreadMessages.find(x => {
            return !!x.embeds.find(embed => embed.title.toUpperCase().includes(aggThread.protocol.toUpperCase())) && moment(new Date(x.timestamp)).isSameOrAfter(messagesAfterTS);
        });

        let embedToAdd = false;
        if (aggThread.embeds.length > 1) {
            if (!!msg) {
                const existingEmbed = msg.embeds.find(x => x.title.toUpperCase().includes("INDEXING ERRORS"));
                if (existingEmbed) {
                    const aggThreadNetworkStringsArr = aggThread.embeds[0].value.split('\n').join('-----').split('-----');
                    const aggThreadBlockValueArr = aggThread.embeds[1].value.split('\n').join('-----').split('-----');
                    const existingMessageNetworkStringsArr = existingEmbed.fields[0].value.split('\n').join('-----').split('-----');
                    const existingMessageBlockValueArr = existingEmbed.fields[1].value.split('\n').join('-----').split('-----');
                    aggThreadNetworkStringsArr.forEach((networkLine, networkIdx) => {
                        const existingMessageIndex = existingMessageNetworkStringsArr.indexOf(networkLine);
                        if (!(existingMessageIndex >= 0 && aggThreadBlockValueArr[networkIdx] === existingMessageBlockValueArr[existingMessageIndex])) {
                            indexingErrorEmbed.fields[0].value += networkLine;
                            indexingErrorEmbed.fields[1].value += aggThreadBlockValueArr[networkIdx];
                            embedToAdd = true;
                        }
                    });
                }
            } else if (aggThread?.embeds[0]?.value?.length > 0 && aggThread?.embeds[1]?.value?.length > 0) {
                indexingErrorEmbed.fields[0].value += aggThread.embeds[0].value;
                indexingErrorEmbed.fields[1].value += aggThread.embeds[1].value;
                embedToAdd = true;
            }
        }

        if (embedToAdd) {
            indexingErrorEmbed.color = colorsArray[Math.floor(Math.random() * 8)];
            aggThreadMsgObjectsToSend.unshift(indexingErrorEmbed);
        }

        if (aggThread.protocolErrorEmbeds) {
            aggThreadMsgObjectsToSend = [...aggThreadMsgObjectsToSend, ...aggThread.protocolErrorEmbeds]
        }

        if (aggThreadMsgObjectsToSend.length > 0) {
            const postJSON = JSON.stringify({ "content": `**Subgraph Bot Monitor - Errors detected on ${aggThread.protocol} subgraphs (prod)**\n`, "embeds": aggThreadMsgObjectsToSend });
            const query = axios.post(baseURL, postJSON, { "headers": { ...headers } }).catch(err => console.log(aggThread.protocol));
            aggThreadQueriesToResolve.push(query);
        }
    })

    try {
        await resolveQueriesToAttempt(aggThreadQueriesToResolve);
        aggThreadMsgObjects = [];
    } catch (err) {
        console.log(err?.response?.config?.data);
        if (err?.response?.status === 429) {
            return aggThreadMsgObjects;
        } else {
            errorNotification("ERROR LOCATION 26 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message);
            return null;
        }
    }
}

export async function sendMessageToZapierThread(msgObj) {
    const postedIssues = await getGithubIssues();
    const currentThreadMessages = await fetchMessages("", process.env.PROD_CHANNEL);
    const currentThreadMessagesContent = currentThreadMessages.map(x => x.content);
    const baseURL = "https://discordapp.com/api/channels/" + process.env.PROD_CHANNEL + "/messages";
    const headers = {
        "Authorization": "Bot " + process.env.BOT_TOKEN,
        "Content-Type": "application/json",
    };

    let messageConstruction = ``;
    const ghIssuePromiseArray = [];

    if (Object.keys(msgObj).includes('indexing')) {
        let invalidIndexingAlertIndexes = [];
        const threadIndexingAlerts = currentThreadMessagesContent.filter(x => x.toUpperCase().includes('INDEXING') && x.toUpperCase().includes(msgObj.protocolName.toUpperCase()) && (!msgObj.protocolName.toUpperCase().includes('PENDING') && !x.toUpperCase().includes('PENDING') || msgObj.protocolName.toUpperCase().includes('PENDING') && x.toUpperCase().includes('PENDING')));

        threadIndexingAlerts.forEach(indexingThread => {
            msgObj.indexing.forEach((indexingAlert, idx) => {
                if (indexingThread.toUpperCase().includes(indexingAlert.zappierMessage?.toUpperCase())) {
                    invalidIndexingAlertIndexes.push(idx);
                }
            })
        });
        const validAlerts = msgObj.indexing.filter((x, idx) => !invalidIndexingAlertIndexes.includes(idx));
        if (validAlerts.length > 0) {
            messageConstruction += `Indexing errors on ${msgObj.protocolName}\n\n`;
            messageConstruction += validAlerts.map(x => x.zappierMessage).join('\n');
            ghIssuePromiseArray.push(postGithubIssue(msgObj.protocolName + ": Indexing Errors", validAlerts.map(x => x.ghMessage).join('\n'), postedIssues));
        }
    } else if (Object.keys(msgObj).includes('protocol')) {
        const invalidProtocolAlertIndexes = {};
        Object.keys(msgObj.protocol).forEach(deployment => {
            invalidProtocolAlertIndexes[deployment] = [];
            const threadProtocolAlerts = currentThreadMessagesContent.filter(x => {
                return x.toUpperCase().includes('PROTOCOL') && x.toUpperCase().includes(deployment.toUpperCase()) && (!deployment.toUpperCase().includes('PENDING') && !x.toUpperCase().includes('PENDING') || deployment.toUpperCase().includes('PENDING') && x.toUpperCase().includes('PENDING'));
            });
            if (threadProtocolAlerts) {
                threadProtocolAlerts.forEach(alert => {
                    msgObj.protocol[deployment]?.Field?.forEach((fieldName, idx) => {
                        const alertStrAfterFieldName = alert?.toUpperCase()?.split(fieldName?.toUpperCase())[1];
                        const alertStrBeforeDesc = alertStrAfterFieldName?.split('DESCRIPTION')[0];
                        const alertToBeSent = msgObj?.protocol[deployment]?.Value[idx]?.toUpperCase();
                        const valueCondition = alertStrBeforeDesc?.includes(alertToBeSent);
                        if (alert.toUpperCase().includes(fieldName.toUpperCase()) && valueCondition) {
                            invalidProtocolAlertIndexes[deployment].push(idx);
                        }
                    })
                })
            }
            const validAlerts = []
            msgObj.protocol[deployment]?.Field?.forEach((x, idx) => {
                if (!invalidProtocolAlertIndexes[deployment].includes(idx)) {
                    const alertBody = `Field: ${x}\nValue: ${msgObj.protocol[deployment]?.Value[idx]}\nDescription: ${msgObj.protocol[deployment]?.Description[idx]}\n`;
                    validAlerts.push(alertBody);
                    ghIssuePromiseArray.push(postGithubIssue(msgObj.protocolName + " " + deployment + ": Protocol Error " + x, alertBody, postedIssues));
                }
            })
            if (validAlerts.length > 0) {
                let link = `https://subgraphs.messari.io/subgraph?endpoint=messari/${msgObj.protocolName}-${deployment}&tab=protocol${deployment.toUpperCase().includes('PENDING') ? '&version=pending' : ""}`;
                messageConstruction += `\n${deployment}: ${link}\n${validAlerts.join('\n')}`;
            }
        })
        if (messageConstruction.length > 0) {
            messageConstruction = `Protocol Errors on ${msgObj.protocolName}\n` + messageConstruction;
        }
    }

    if (messageConstruction.length === 0) {
        return null;
    }

    const postJSON = JSON.stringify({ "content": messageConstruction });

    if (ghIssuePromiseArray.length > 0) {
        await Promise.all(ghIssuePromiseArray);
    }

    try {
        const req = await axios.post(baseURL, postJSON, { "headers": { ...headers } }).catch(async function (err1) {
            await sleep(5000);
            await axios.post(baseURL, postJSON, { "headers": { ...headers } }).catch((err) => console.log("ERROR ZAPIER MSG # " + err?.response?.data?.message + err?.response?.data?.retry_after + err?.response?.config?.data))
        });
        return req;
    } catch (err) {
        console.log(err?.response?.config?.data)
        if (err?.response?.status === 429) {
            return null;
        } else {
            errorNotification("ERROR LOCATION 29 " + err?.message + ' ' + err?.response?.config?.url + ' ' + err?.response?.config?.data + ' ' + err?.response?.data?.message);
            return null;
        }
    }
}
