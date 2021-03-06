const assert = require('assert');
const {default: Shogi} = require('shogi9.js');
const {default: Color} = require('shogi9.js/lib/Color.js');

const gridList = [
	{},
	{kind: 'OU', color: Color.Black},
	{kind: 'HI', color: Color.Black},
	{kind: 'RY', color: Color.Black},
	{kind: 'KA', color: Color.Black},
	{kind: 'UM', color: Color.Black},
	{kind: 'KI', color: Color.Black},
	{kind: 'GI', color: Color.Black},
	{kind: 'NG', color: Color.Black},
	{kind: 'KE', color: Color.Black},
	{kind: 'NK', color: Color.Black},
	{kind: 'KY', color: Color.Black},
	{kind: 'NY', color: Color.Black},
	{kind: 'FU', color: Color.Black},
	{kind: 'TO', color: Color.Black},
	{kind: 'OU', color: Color.White},
	{kind: 'HI', color: Color.White},
	{kind: 'RY', color: Color.White},
	{kind: 'KA', color: Color.White},
	{kind: 'UM', color: Color.White},
	{kind: 'KI', color: Color.White},
	{kind: 'GI', color: Color.White},
	{kind: 'NG', color: Color.White},
	{kind: 'KE', color: Color.White},
	{kind: 'NK', color: Color.White},
	{kind: 'KY', color: Color.White},
	{kind: 'NY', color: Color.White},
	{kind: 'FU', color: Color.White},
	{kind: 'TO', color: Color.White},
];

const handList = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];

module.exports.charToPiece = (char) =>
	({
		歩: 'FU',
		歩兵: 'FU',
		香: 'KY',
		香車: 'KY',
		桂: 'KE',
		桂馬: 'KE',
		銀: 'GI',
		銀将: 'GI',
		金: 'KI',
		金将: 'KI',
		飛: 'HI',
		飛車: 'HI',
		角: 'KA',
		角行: 'KA',
		王: 'OU',
		王将: 'OU',
		玉: 'OU',
		玉将: 'OU',
		と: 'TO',
		と金: 'TO',
		成香: 'NY',
		杏: 'NY',
		成桂: 'NK',
		圭: 'NK',
		成銀: 'NG',
		全: 'NG',
		龍: 'RY',
		龍王: 'RY',
		竜: 'RY',
		竜王: 'RY',
		馬: 'UM',
		龍馬: 'UM',
		竜馬: 'UM',
	}[char]);

module.exports.pieceToChar = (piece) =>
	({
		FU: '歩',
		KY: '香',
		KE: '桂',
		GI: '銀',
		KI: '金',
		HI: '飛',
		KA: '角',
		OU: '玉',
		TO: 'と',
		NY: '成香',
		NK: '成桂',
		NG: '成銀',
		RY: '龍',
		UM: '馬',
	}[piece]);

module.exports.deserialize = (blob) => {
	const gridsBlob = [...blob]
		.slice(0, 8)
		.map((byte) => byte.toString(2).padStart(8, '0'))
		.join('');
	const handsBlob = [...blob]
		.slice(8, 12)
		.map((byte) => byte.toString(2).padStart(8, '0'))
		.join('');

	const gridNumbers = gridsBlob
		.slice(-45)
		.match(/.{1,5}/g)
		.reverse()
		.map((bin) => parseInt(bin, 2));

	const grids = gridNumbers.map((number) => gridList[number]);

	const handNumbers = [];
	let offset = handsBlob.length;
	for (const size of [3, 3, 4, 4, 4, 4, 6]) {
		offset -= size;
		handNumbers.push(parseInt(handsBlob.slice(offset, offset + size), 2));
	}

	const hands = {first: {}, second: {}};

	for (const [index, number] of handNumbers.entries()) {
		const maxPieces = [2, 2, 4, 4, 4, 4, 7][index];
		let second = number;
		let first = 0;
		while (second >= maxPieces + 1 - first) {
			second -= maxPieces + 1 - first;
			first++;
		}
		hands.first[handList[index]] = first;
		hands.second[handList[index]] = second;
	}

	return new Shogi({
		preset: 'OTHER',
		data: {
			color: Color.Black,
			board: [
				[grids[2], grids[5], grids[8]],
				[grids[1], grids[4], grids[7]],
				[grids[0], grids[3], grids[6]],
			],
			hands: [hands.first, hands.second],
		},
	});
};

module.exports.serialize = (board) => {
	const gridNumbers = [];

	for (const y of Array(3).keys()) {
		for (const x of Array(3).keys()) {
			const gridData = board.board[2 - x][y];
			if (gridData) {
				gridNumbers.push(
					gridList.findIndex(
						(grid) =>
							grid.kind === gridData.kind && grid.color === gridData.color
					)
				);
			} else {
				gridNumbers.push(0);
			}
		}
	}

	const gridBin = gridNumbers
		.reverse()
		.map((number) => number.toString(2).padStart(5, '0'))
		.join('')
		.padStart(64, '0');

	const handBins = [];

	for (const [index, piece] of handList.entries()) {
		const [size, maxPieces] = [
			[3, 2],
			[3, 2],
			[4, 4],
			[4, 4],
			[4, 4],
			[4, 4],
			[6, 7],
		][index];
		const counts = board.hands.map(
			(pieces) => pieces.filter(({kind}) => kind === piece).length
		);
		const number =
			((maxPieces + 1) * 2 - counts[Color.Black] + 1) *
				counts[Color.Black] /
				2 +
			counts[Color.White];
		handBins.push(number.toString(2).padStart(size, '0'));
	}

	const handBin = handBins
		.reverse()
		.join('')
		.padStart(32, '0');

	const gridHex = gridBin.replace(/.{1,4}/g, (byte) =>
		parseInt(byte, 2).toString(16));
	const handHex = handBin.replace(/.{1,4}/g, (byte) =>
		parseInt(byte, 2).toString(16));

	return Buffer.from(gridHex + handHex, 'hex');
};

module.exports.getTransitions = (board) => {
	const transitions = [];

	for (const y of Array(3).keys()) {
		for (const x of Array(3).keys()) {
			const piece = board.get(x + 1, y + 1);

			if (!piece || piece.color !== Color.Black) {
				continue;
			}

			const moves = board.getMovesFrom(x + 1, y + 1);
			for (const move of moves) {
				const promoteBoard = board.clone();
				promoteBoard.move(
					move.from.x,
					move.from.y,
					move.to.x,
					move.to.y,
					// とりあえず成でmoveしてみる
					move.from.y === 1 || move.to.y === 1
				);
				const transition = {
					type: 'move',
					data: move,
					kind: board.get(move.from.x, move.from.y).kind,
					board: promoteBoard.inverse(),
					promotion: null,
				};

				// ほんとうに成ったなら不成も生成する
				if (
					promoteBoard.get(move.to.x, move.to.y).kind !==
					board.get(move.from.x, move.from.y).kind
				) {
					transition.promotion = true;

					const unpromoteBoard = board.clone();

					unpromoteBoard.move(
						move.from.x,
						move.from.y,
						move.to.x,
						move.to.y,
						false
					);

					// 強制的に成った場合は追加しない
					if (
						unpromoteBoard.get(move.to.x, move.to.y).kind ===
						board.get(move.from.x, move.from.y).kind
					) {
						transitions.push({
							type: 'move',
							data: move,
							kind: board.get(move.from.x, move.from.y).kind,
							board: unpromoteBoard.inverse(),
							promotion: false,
						});
					}
				}

				transitions.push(transition);
			}
		}
	}

	for (const drop of board.getDropsBy(Color.Black)) {
		const dropBoard = board.clone();
		dropBoard.drop(drop.to.x, drop.to.y, drop.kind, Color.Black);
		transitions.push({
			type: 'drop',
			data: drop,
			board: dropBoard.inverse(),
			promotion: null,
		});
	}

	return transitions;
};

module.exports.transitionToText = (transition, color, previousPosition) => {
	const koma = color === Color.Black ? '☗' : '☖';
	const x =
		color === Color.Black ? transition.data.to.x - 1 : 3 - transition.data.to.x;
	const xText = '123'[x];
	const y =
		color === Color.Black ? transition.data.to.y - 1 : 3 - transition.data.to.y;
	const yText = '一二三'[y];

	const coords =
		previousPosition &&
		previousPosition.x === x + 1 &&
		previousPosition.y === y + 1
			? '同'
			: `${xText}${yText}`;

	if (transition.type === 'move') {
		const pieceChar = module.exports.pieceToChar(transition.kind);

		if (transition.promotion === null) {
			return `${koma}${coords}${pieceChar}`;
		}

		const promoteFlag = transition.promotion ? '成' : '不成';
		return `${koma}${coords}${pieceChar}${promoteFlag}`;
	}

	assert(transition.type === 'drop');
	{
		const pieceChar = module.exports.pieceToChar(transition.data.kind);
		return `${koma}${coords}${pieceChar}`;
	}
};
