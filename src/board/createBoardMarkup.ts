export function createBoardMarkup(onPointClicked: (pointId: number) => void): HTMLElement {
	const board = document.createElement('div');
	board.className = 'board';

	board.appendChild(makeDiceContainer());
	board.appendChild(makeCubeContainer());
	board.appendChild(makeHalf('upper-half', [27], range(24, 19), 25, range(18, 13), onPointClicked));
	board.appendChild(makeHalf('lower-half', [26], range(1, 6), 0, range(7, 12), onPointClicked));

	return board;
}

function makeCubeContainer(): HTMLElement {
	const container = document.createElement('div');
	container.className = 'dice-container hidden';
	container.id = 'cube-container';

	// Create cube element
	const cube = document.createElement('div');
	cube.id = 'game-cube';
	cube.className = 'doubling-cube';
	cube.dataset.value = '64';
	cube.innerText = '64'; // Add this line
	container.appendChild(cube);
	return container;
}

function makeDiceContainer(): HTMLElement {
	const container = document.createElement('div');
	container.className = 'dice-container hidden';
	return container;
}

function range(from: number, to: number): number[] {
	const result: number[] = [];
	if (from <= to) {
		for (let i = from; i <= to; i++) result.push(i);
	} else {
		for (let i = from; i >= to; i--) result.push(i);
	}
	return result;
}

function makeHalf(
	halfClass: string,
	bearOffIds: number[],
	leftPoints: number[],
	barId: number,
	rightPoints: number[],
	onPointClicked: (pointId: number) => void
): HTMLElement {
	const half = document.createElement('div');
	half.className = halfClass;

	const bearOffClass = halfClass === 'upper-half' ? 'bear-off-top' : 'bear-off-bottom';
	half.appendChild(makeClickable(`bear-off ${bearOffClass}`, bearOffIds[0], onPointClicked));

	leftPoints.forEach((id) => half.appendChild(makePoint(id, onPointClicked)));
	half.appendChild(makeClickable('point bar', barId, onPointClicked));
	rightPoints.forEach((id) => half.appendChild(makePoint(id, onPointClicked)));

	half.appendChild(document.createElement('div')).className = `bear-off ${bearOffClass}`;

	return half;
}

function makePoint(id: number, onPointClicked: (pointId: number) => void): HTMLElement {
	const shade = id % 2 === 0 ? 'light' : 'dark';
	return makeClickable(`point ${shade}`, id, onPointClicked);
}

function makeClickable(className: string, pointId: number, onPointClicked: (pointId: number) => void): HTMLElement {
	const el = document.createElement('div');
	el.className = className;
	el.id = `point-${pointId}`;
	el.addEventListener('click', () => onPointClicked(pointId));
	return el;
}