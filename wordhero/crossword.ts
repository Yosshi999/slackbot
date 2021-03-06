import {WebClient, RTMClient} from '@slack/client';
// @ts-ignore
import cloudinary from 'cloudinary';
// @ts-ignore
import {stripIndent} from 'common-tags';
// @ts-ignore
import {hiraganize} from 'japanese';
import {renderCrossword} from './render';
import generateCrossword from './generateCrossword';
import boardConfigs from './boards.json';

interface SlackInterface {
	rtmClient: RTMClient,
	webClient: WebClient,
}

interface Description {
	word: string,
	description: string,
	ruby: string,
};

const uploadImage = async (board: {color: string, letter: string}[], boardIndex: number) => {
	const imageData = await renderCrossword(board, boardIndex);
	const cloudinaryData: any = await new Promise((resolve, reject) => {
		cloudinary.v2.uploader
			.upload_stream({resource_type: 'image'}, (error: any, response: any) => {
				if (error) {
					reject(error);
				} else {
					resolve(response);
				}
			})
			.end(imageData);
	});
	return cloudinaryData;
};

const colors = [
	'#FF6F00',
	'#7E57C2',
	'#0288D1',
	'#388E3C',
	'#F44336',
	'#6D4C41',
	'#EC407A',
	'#01579B',
	'#00838F',
	'#558B2F',
	'#8D6E63',
	'#AB47BC',
	'#1E88E5',
	'#009688',
	'#827717',
	'#E65100',
];

export default async ({rtmClient: rtm, webClient: slack}: SlackInterface) => {
	const state: {
		thread: string,
		isHolding: boolean,
		crossword: {
			words: string[],
			descriptions: Description[],
			board: string[],
			index: number,
		},
		board: string[],
		hitWords: string[],
		timeouts: NodeJS.Timeout[],
	} = {
		thread: null,
		isHolding: false,
		crossword: null,
		board: [],
		hitWords: [],
		timeouts: [],
	};

	rtm.on('message', async (message) => {
		if (!message.text || message.subtype || message.channel !== process.env.CHANNEL_SANDBOX) {
			return;
		}

		if (message.thread_ts && message.thread_ts === state.thread) {
			const word = hiraganize(message.text);

			if (!state.crossword.words.includes(word) || state.hitWords.includes(word)) {
				await slack.reactions.add({
					name: 'no_good',
					channel: message.channel,
					timestamp: message.ts,
				});
				return;
			}

			const newIndices = new Set();

			for (const [index, correctWord] of state.crossword.words.entries()) {
				if (word === correctWord) {
					for (const letterIndex of boardConfigs[state.crossword.index].find((constraint) => constraint.index === index + 1).cells) {
						newIndices.add(letterIndex);
						state.board[letterIndex] = state.crossword.board[letterIndex];
					}
				}
			}

			state.hitWords = state.crossword.words.filter((_, index) => {
				const cells = boardConfigs[state.crossword.index].find((constraint) => constraint.index === index + 1).cells;
				return cells.every((cell) => state.board[cell] !== null);
			});

			if (state.board.every((cell, index) => state.crossword.board[index] === null || cell !== null)) {
				for (const timeout of state.timeouts) {
					clearTimeout(timeout);
				}
				const thread = state.thread;
				state.thread = null;
				state.isHolding = false;

				await slack.reactions.add({
					name: 'tada',
					channel: message.channel,
					timestamp: message.ts,
				});

				const cloudinaryData: any = await uploadImage(state.crossword.board.map((letter) => ({
					color: 'red',
					letter,
				})), state.crossword.index);

				await slack.chat.postMessage({
					channel: process.env.CHANNEL_SANDBOX,
					text: stripIndent`
						クリア！:raised_hands:
					`,
					username: 'crossword',
					icon_emoji: ':capital_abcd:',
					thread_ts: thread,
					reply_broadcast: true,
					attachments: [{
						title: 'Cross Word',
						image_url: cloudinaryData.secure_url,
					}, ...state.crossword.descriptions.map(({word, ruby, description}, index) => ({
						text: `${index + 1}. ${word} (${ruby}): ${description}`,
						color: state.hitWords.includes(ruby) ? '#FF6F00' : '',
					}))],
				});
			} else {
				await slack.reactions.add({
					name: '+1',
					channel: message.channel,
					timestamp: message.ts,
				});

				const cloudinaryData: any = await uploadImage(state.board.map((letter, index) => (letter === null ? null : {
					color: newIndices.has(index) ? 'red' : 'black',
					letter,
				})), state.crossword.index);

				await slack.chat.postMessage({
					channel: process.env.CHANNEL_SANDBOX,
					text: stripIndent`
						わいわい！
					`,
					username: 'crossword',
					icon_emoji: ':capital_abcd:',
					thread_ts: state.thread,
					reply_broadcast: true,
					attachments: [{
						title: 'Cross Word',
						image_url: cloudinaryData.secure_url,
					}, ...state.crossword.descriptions.map(({description, ruby}, index) => {
						const cells = boardConfigs[state.crossword.index].find((constraint) => constraint.index === index + 1).cells;
						return {
							text: `${index + 1}. ${cells.map((cell) => state.board[cell] || '◯').join('')}: ${description}`,
							ruby,
							color: colors[index],
						};
					}).filter(({ruby}) => (
						!state.hitWords.includes(ruby)
					))],
				});
			}

			return;
		}

		if (message.text.match(/^crossword$/i)) {
			if (state.isHolding) {
				return;
			}

			state.isHolding = true;
			state.board = Array(36).fill(null);
			state.hitWords = [];
			state.timeouts = [];
			const crossword = await generateCrossword();
			state.crossword = crossword;

			const cloudinaryData: any = await uploadImage(Array(16).fill(null), state.crossword.index);
			const seconds = boardConfigs[state.crossword.index].length * 10;

			const {ts}: any = await slack.chat.postMessage({
				channel: process.env.CHANNEL_SANDBOX,
				text: stripIndent`
					楽しいクロスワードパズルを始めるよ～
					マスに入ると思う単語を${seconds}秒以内に *スレッドで* 返信してね!
				`,
				username: 'crossword',
				icon_emoji: ':capital_abcd:',
				reply_broadcast: true,
				attachments: [{
					title: 'Cross Word',
					image_url: cloudinaryData.secure_url,
				}, ...state.crossword.descriptions.map(({description}, index) => {
					const cells = boardConfigs[state.crossword.index].find((constraint) => constraint.index === index + 1).cells;
					return {
						text: `${index + 1}. ${cells.map((cell) => state.board[cell] || '◯').join('')}: ${description}`,
						color: colors[index],
					};
				})],
			});

			state.thread = ts;

			await slack.chat.postMessage({
				channel: process.env.CHANNEL_SANDBOX,
				text: 'ここにお願いします！',
				thread_ts: ts,
				username: 'crossword',
				icon_emoji: ':capital_abcd:',
			});

			state.timeouts.push(setTimeout(async () => {
				state.thread = null;
				await slack.chat.postMessage({
					channel: process.env.CHANNEL_SANDBOX,
					text: '～～～～～～～～～～おわり～～～～～～～～～～',
					thread_ts: ts,
					username: 'crossword',
					icon_emoji: ':capital_abcd:',
				});
				const cloudinaryData: any = await uploadImage(state.crossword.board.map((letter, index) => ({
					color: state.board[index] === null ? 'gray' : 'black',
					letter,
				})), state.crossword.index);
				await slack.chat.postMessage({
					channel: process.env.CHANNEL_SANDBOX,
					text: stripIndent`
						残念、クリアならず:cry:
					`,
					username: 'crossword',
					icon_emoji: ':capital_abcd:',
					reply_broadcast: true,
					attachments: [{
						title: 'Cross Word',
						image_url: cloudinaryData.secure_url,
					}, ...state.crossword.descriptions.map(({word, ruby, description}, index) => ({
						text: `${index + 1}. ${word} (${ruby}): ${description}`,
						color: state.hitWords.includes(ruby) ? '#FF6F00' : '',
					}))],
				});
				state.isHolding = false;
			}, seconds * 1000));

			return;
		}
	});
};
