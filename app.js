const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const { isBoolean } = require("util");
const { runInThisContext } = require("vm");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const port = process.env.PORT || 4001;
const index = require("./routes/index");
app.use(index);

// Game class
class Game {
	constructor(io) {
		this.id = "TODO";
		this.io = io;
		this.playerList = [];
		this.start = 0;
		this.deck = [];
		this.status = "waiting";
		this.cardOnTop = [];
	}

	inspect(depth, opts) {
		return `Game =
		id = ${this.id},
		players = ${this.playerList}
		status = ${this.status}`;
	}

	startGame() {
		this.startDate = new Date().getTime();
		this.status = "inProgress";
		this.deck = createDeck();
		this._distributeDeck();

		console.log(`distributing cards`);
		for (player of this.playerList) {
			player.emitCard();
		}

		this.emitCard();
	}

	_distributeDeck() {
		this.cardOnTop = this.deck.pop();
		let len = this.deck.length;
		for (var i = 0; i < len; i++) {
			this.playerList[i % this.playerList.length].cardList.push(this.deck.pop());
		}
	}

	emitCard() {
		console.log("emitting game card");
		this.io.emit("gameCard", { card: this.cardOnTop });
	}

	handlePlayerChoice(playerId, symbolId, card) {
		let player = this.getPlayerById(playerId);
		if (player.isBanned()) {
			console.log(`player ${player.name} can't play while banned`);
			return;
		}
		console.log(
			`${player.name} played: ${symbolId} from card ${card} --${this.cardOnTop.includes(parseInt(symbolId))}`
		);
		if (!player.isBanned() && this.validateChoice(symbolId)) {
			// update game card on top
			this.cardOnTop = card;
			this.emitCard();
			// reset all bans
			this.resetAllBans();

			// check if player won
			if (this.isOver()) {
				this.announceResults(player.id);
			} else {
				// update player top card
				player.emitCard();
			}
		} else {
			// ban the player
			player.ban();
		}
	}

	getPlayerById(playerId) {
		for (player of this.playerList) {
			if (player.id === playerId) {
				return player;
			}
		}
	}

	validateChoice(symbolId) {
		return this.cardOnTop.includes(parseInt(symbolId));
	}

	resetAllBans() {
		for (player of this.playerList) {
			player.resetBan();
		}
	}

	isOver() {
		for (player of this.playerList) {
			if (player.cardList.length == 0) {
				console.log(`Player ${player.name} won the game!`);
				this.status = "over";
				return true;
			}
		}
		return false;
	}

	announceResults(winningPlayerId) {
		// We use winningPlayerId here to prevent having more than 1 winner
		for (player of this.playerList) {
			player.socket.emit("result", { result: player.id == winningPlayerId ? 1 : -1 });
		}
	}
}

// Player lass
class Player {
	constructor(socket, name) {
		this.socket = socket;
		this.id = socket.id;
		this.name = name || `player${id}`;
		this.cardList = [];
		this.banLevel = 0;
		this.banDate = 0;
	}

	inspect(depth, opts) {
		return `Game =
		id=${this.id}, name=${this.playerList}`;
	}

	resetBan() {
		this.banLevel = 0;
	}

	ban() {
		this.banLevel = (this.banLevel || 2000) * 2; // Start with 2000ms * 2 as first ban, then double previous ban period
		this.banDate = new Date().getTime();
		console.log(`player ${this.name} received a ban of ${this.banLevel}ms`);

		//emit ban
		this.socket.emit("ban", { banEndDate: this.banDate + this.banLevel });
	}

	isBanned() {
		return new Date().getTime() < this.banDate + this.banLevel;
	}

	getCard() {
		return this.cardList.pop();
	}

	emitCard() {
		console.log(`sending card to ${this.name}`);
		this.socket.emit("playerCard", { card: this.getCard() });
	}
}

// utils

function shuffle(array) {
	var currentIndex = array.length,
		temporaryValue,
		randomIndex;

	// While there remain elements to shuffle...
	while (0 !== currentIndex) {
		// Pick a remaining element...
		randomIndex = Math.floor(Math.random() * currentIndex);
		currentIndex -= 1;

		// And swap it with the current element.
		temporaryValue = array[currentIndex];
		array[currentIndex] = array[randomIndex];
		array[randomIndex] = temporaryValue;
	}

	return array;
}

function createDeck() {
	// deck with 7 cards
	return shuffle(
		[
			[0, 1, 2],
			[3, 1, 4],
			[5, 0, 4],
			[0, 3, 6],
			[5, 3, 2],
			[4, 6, 2],
			[6, 1, 5],
		].map(shuffle)
	);
	// TODO make deck with 57 cards
}

// main
let gameList = [];

// start new game
game = new Game(io);
gameList.push(game);

io.on("connection", (socket) => {
	// connection / disconnection
	// Player connected
	player = new Player(socket, "seddik");
	console.log("New player connected:" + player.id, player.name);
	if (game.status == "waiting") {
		game.playerList.push(player);
	}

	////////////////////
	// SOCKET SECTION //
	///////////////////

	// player disconnected
	socket.on("disconnect", () => {
		console.log("Client disconnected: " + socket.id);
	});
	// player choice
	socket.on("choose", (data) => {
		game.handlePlayerChoice(socket.id, data["symbolId"], data["card"]);
	});

	//trigger for dev TODO remove

	socket.on("trigger", (symbol_id) => {
		console.log("recieved trigger");
		game.startGame();
	});
});

server.listen(port, () => console.log(`Listening on port ${port}`));
