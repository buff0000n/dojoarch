//==============================================================
// undo/redo framework
//==============================================================

class Action {
	prepareUndoAction() {
		return true;
	}

	undoAction() {
		throw "not implemented";
	}

	prepareRedoAction() {
		return true;
	}

	redoAction() {
		throw "not implemented";
	}

	toString() {
		throw "not implemented";
	}
}

var undoStack = Array();
var redoStack = Array();
var maxUndoStackSize = 100;

function updateUndoRedoButton(button, stack, prefix) {
	if (stack.length > 0) {
		button.className = "button";
		button.children[0].title = prefix + " " + stack[stack.length - 1].toString();

	} else {
		button.className = "button-disabled";
		button.alt = prefix;
	}
}

function updateButtons() {
	updateUndoRedoButton(document.getElementById("undoButton"), undoStack, "Undo");
	updateUndoRedoButton(document.getElementById("redoButton"), redoStack, "Redo");
}

function addUndoAction(action) {
	// add to the stack
	undoStack.push(action);
	// trim the back of the stack if it's exceeded the max size
	while (undoStack.length > maxUndoStackSize) {
		undoStack.shift();
	}
	// clear the redo stack
	redoStack = Array();
	// update UI
	updateButtons();
}

function doUndo() {
	// pop the last action
	var action = undoStack.pop();
	// make sure there was a last action
	if (action) {
		// prepare the action, this can be nothing or can involve things like moving the view to where the action
		// took place
		if (!action.prepareUndoAction()) {
			// if we had to prepare, then the user needs to undo again to actually undo the action
			undoStack.push(action);

		} else {
			// we're prepared, so undo the action
            showDebug("undoing: " + action.toString());
			action.undoAction();
			// put it on the redo stack
			redoStack.push(action);
		}
		// update UI
		updateButtons();
	}
}

function doRedo() {
	// pop the next action
	var action = redoStack.pop();
	// make sure is a next action
	if (action) {
		// prepare the action, this can be nothing or can involve things like moving the view to where the action
		// takes place
		if (!action.prepareRedoAction()) {
			// if we had to prepare, then the user needs to redo again to actually redo the action
			redoStack.push(action);

		} else {
			// we're prepared, so redo the action
            showDebug("redoing: " + action.toString());
			action.redoAction();
			// put it back on the undo stack
			undoStack.push(action);
		}
		// update UI
		updateButtons();
	}
}

//==============================================================
// Undo/Redo actions
//==============================================================

function describeRoomList(rooms) {
    if (!rooms || rooms.length == 0) {
        return "nothing";
    }
    if (rooms.length == 1) {
        return rooms[0].metadata.name;
    }
    return rooms.length + " rooms";
}

class MoveRoomAction extends Action {
	constructor(rooms) {
		super();
		this.rooms = rooms;
		this.recordFrom(this.rooms);
	}
	
	recordFrom() {
	    this.from = [];
	    for (var r = 0; r < this.rooms.length; r++) {
	        this.from.push(new RoomPosition(this.rooms[r]));
	    }
	    this.fromCenter = new DojoBounds(this.rooms).centerPosition();
	}

	recordTo() {
	    this.to = [];
	    for (var r = 0; r < this.rooms.length; r++) {
	        this.to.push(new RoomPosition(this.rooms[r]));
	    }
	    this.toCenter = new DojoBounds(this.rooms).centerPosition();
	}

	isAMove() {
		this.recordTo(this.rooms);
		for (var r = 0; r < this.rooms.length; r++) {
		    if (!this.from[r].equals(this.to[r])) {
		        return true;
            }
		}
		return false;
	}

	prepareUndoAction() {
		return this.prepareAction(this.fromCenter);
	}

	undoAction() {
        this.action(this.to, this.from);
	}

	prepareRedoAction() {
		return this.prepareAction(this.toCenter);
	}

	redoAction() {
        this.action(this.from, this.to);
	}

	prepareAction(center) {
        centerViewOnIfNotVisible(center.MX, center.MY, center.Floor);
		// having a prepare step to show what's about to change feels more confusing than not having it
		return true;
	}

	action(from, to) {
	    for (var r = 0; r < this.rooms.length; r++) {
	        var room = this.rooms[r];
            if (from[r].Floor != to[r].Floor) {
                removeFloorRoom(room);
            }
            room.disconnectAllDoors();
            room.setPositionAndConnectDoors(to[r].MX, to[r].MY, to[r].Floor, to[r].R);
            if (from[r].Floor != to[r].Floor) {
                addFloorRoom(room);
            }

            room.updateView();
	    }

		selectRooms(this.rooms, false, false);
		saveModelToUrl();
	}

	toString() {
		return "Move " + describeRoomList(this.rooms);
	}
}

class AddDeleteRoomsAction extends Action {
	constructor(rooms, add) {
		super();
		this.rooms = rooms;
		this.records = [];
		this.center = new DojoBounds(rooms).centerPosition();
		for (var r = 0; r < this.rooms.length; r++) {
		    this.records.push(new RoomPosition(this.rooms[r]));
		}
		this.add = add;
	}

	prepareUndoAction() {
        centerViewOnIfNotVisible(this.center.MX, this.center.MY, this.center.Floor);
		// having a prepare step to show what's about to change feels more confusing than not having it
		return true;
	}

	prepareRedoAction() {
		return this.prepareUndoAction();
	}

	undoAction() {
		this.doAction(false);
	}

	redoAction() {
		this.doAction(true);
	}

	doAction(redo) {
		// there's no logical XOR in Javascript?!
		if (!this.add && redo) this.removeAction();
		else if (!this.add && !redo) this.addAction();
		else if (this.add && redo) this.addAction();
		else if (this.add && !redo) this.removeAction();
	}

	addAction() {
	    for (var r = 0; r < this.rooms.length; r++) {
            addRoom(this.rooms[r]);
            // hax to force it to think the floor has changed and setup its display
            this.rooms[r].floor = 100;
            this.rooms[r].setPositionAndConnectDoors(this.records[r].MX, this.records[r].MY, this.records[r].Floor, this.records[r].R);
            this.rooms[r].select();
            this.rooms[r].updateView();
	    }
//        selectRoom(this.room)
        selectedRooms = this.rooms;

		saveModelToUrl();3
	}

	removeAction() {
	    for (var r = 0; r < this.rooms.length; r++) {
            this.rooms[r].deselect();
    	    removeRoom(this.rooms[r]);
            selectedRooms = [];
	    }
	}

	toString() {
		return (this.add ? "Add " : "Delete ") + describeRoomList(this.rooms);
	}
}

class SelectionAction extends Action {
	constructor(oldSelections, newSelections) {
		super();
		this.oldSelections = oldSelections;
		this.oldCenter = this.oldSelections && this.oldSelections.length > 0 ? 
		    new DojoBounds(this.oldSelections).centerPosition() :
		    null;
		this.newSelections = newSelections;
		this.newCenter = this.newSelections && this.newSelections.length > 0 ? 
		    new DojoBounds(this.newSelections).centerPosition() :
		    null;
	}

	prepareUndoAction() {
	    return this.prepareAction(this.oldCenter, this.newCenter);
	}

	undoAction() {
		selectRooms(this.oldSelections, false, false);
	}

	prepareRedoAction() {
	    return this.prepareAction(this.newCenter, this.oldCenter);
	}

	redoAction() {
		selectRooms(this.newSelections, false, false);
	}

	prepareAction(center1, center2) {
	    var center = center1 ? center1 : center2;
	    if (center) {
            centerViewOnIfNotVisible(center.MX, center.MY, center.Floor);
	    }
		// having a prepare step to show what's about to change feels more confusing than not having it
		return true;
	}

	toString() {
		return (this.oldSelections ? ("Deselect " + describeRoomList(this.oldSelections)) : "") + ", " +
    		(this.newSelections ? ("Select " + describeRoomList(this.newSelections)) : "");
	}
}
