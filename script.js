class Calculator {
    constructor(currentOperandTextElement, calculationLineElement, historyListElement) {
        this.currentOperandTextElement = currentOperandTextElement;
        this.calculationLineElement = calculationLineElement;
        this.historyListElement = historyListElement;
        this.history = JSON.parse(localStorage.getItem('calculatorHistoryV3')) || []; // Changed storage key for safety
        this.currentExpression = '0';
        this.lastComputedFullExpression = '';
        this.justComputed = false;
        this.openParenthesesCount = 0;
        this.clear();
        this.renderHistory();
    }

    clear() {
        this.currentExpression = '0';
        this.lastComputedFullExpression = '';
        this.justComputed = false;
        this.openParenthesesCount = 0;
        this.updateDisplay();
    }

    // Method to clear the history
    clearHistory() {
        this.history = [];
        this.saveHistory(); // Update localStorage
        this.renderHistory(); // Re-render the empty list
    }

    delete() {
        if (this.currentExpression === '0' && !this.justComputed) return; // Don't delete if already '0' and not a result
        if (this.justComputed) {
            this.clear();
            return;
        }

        const lastChar = this.currentExpression.slice(-1);
        if (lastChar === '(') this.openParenthesesCount--;
        if (lastChar === ')') this.openParenthesesCount++;

        this.currentExpression = this.currentExpression.slice(0, -1);
        if (this.currentExpression === '') {
            this.currentExpression = '0';
        }
        this.updateDisplay();
    }
    
    appendToken(token) {
        const lastChar = this.currentExpression.slice(-1);
        const operators = ['+', '-', '*', '÷'];

        if (this.justComputed) {
            if (operators.includes(token)) {
                // currentExpression already holds the result
            } else { 
                this.currentExpression = ''; 
            }
            this.justComputed = false;
            this.lastComputedFullExpression = '';
        }

        if (this.currentExpression === '0' && !operators.includes(token) && token !== '.' && token !== '(' && token !== ')') {
            this.currentExpression = '';
        }
        
        if (operators.includes(lastChar) && operators.includes(token)) {
            if (token === '-' && (lastChar === '*' || lastChar === '÷')) {
                // Allow like "5*-"
            } else {
                this.currentExpression = this.currentExpression.slice(0, -1);
            }
        }
        if (token === '.' && (lastChar === '.' || this.currentExpression.split(/[+\-*/÷()]/).pop().includes('.'))) {
             // Prevent ".." or multiple dots in one number segment
            return;
        }
        if (this.currentExpression === '' && operators.includes(token) && token !== '-') {
            if (token === '+' || token === '*' || token === '÷') return;
        }

        if (token === '(') {
            if (this.currentExpression === '0') this.currentExpression = '';
            if (operators.includes(lastChar) || lastChar === '(' || this.currentExpression === '' || this.currentExpression.endsWith('(')) {
                 this.openParenthesesCount++;
                 this.currentExpression += token;
            } else if (!isNaN(parseFloat(lastChar)) || lastChar === ')') {
                this.currentExpression += '*' + token;
                this.openParenthesesCount++;
            } else { // Default case, just append
                this.currentExpression += token;
                this.openParenthesesCount++;
            }
        } else if (token === ')') {
            if (this.openParenthesesCount > 0 && !operators.includes(lastChar) && lastChar !== '(') {
                this.openParenthesesCount--;
                this.currentExpression += token;
            }
        } else {
            // Handle implicit multiplication before '(', e.g. "5(" -> "5*("
            if (token === '(' && (!isNaN(parseFloat(lastChar)) || lastChar === ')')) {
                this.currentExpression += '*';
            }
            // Handle implicit multiplication after ')', e.g. ")5" -> ")*5"
            if (lastChar === ')' && (!isNaN(parseFloat(token)) || token === '(') ) {
                 this.currentExpression += '*';
            }
            this.currentExpression += token;
        }
        this.updateDisplay();
    }

    compute() {
        let tempExpression = this.currentExpression;
        let tempOpenParenthesesCount = this.openParenthesesCount; // Use a temporary count

        while (tempOpenParenthesesCount > 0) {
            tempExpression += ')';
            tempOpenParenthesesCount--;
        }
        
        try {
            const result = this.evaluateExpression(tempExpression);
            if (result === null || isNaN(result) || !isFinite(result)) {
                throw new Error("Invalid calculation");
            }
            const roundedResult = parseFloat(result.toFixed(10));

            this.lastComputedFullExpression = this.formatExpressionForDisplay(tempExpression) + " =";
            const historyEntry = `${this.formatExpressionForDisplay(tempExpression)} = ${this.getDisplayNumber(roundedResult.toString())}`;
            
            this.history.unshift(historyEntry);
            if (this.history.length > 20) this.history.pop();
            this.saveHistory();
            this.renderHistory();

            this.currentExpression = roundedResult.toString();
            this.justComputed = true;
            this.openParenthesesCount = 0; 

        } catch (error) {
            console.error("Evaluation Error:", error.message, "Expression:", tempExpression);
            this.currentExpression = "Error";
            this.lastComputedFullExpression = "Failed: " + this.formatExpressionForDisplay(this.currentExpression.length < 20 ? this.currentExpression : this.currentExpression.substring(0,20)+"...");
            this.justComputed = true;
            this.openParenthesesCount = 0; 
        }
        this.updateDisplay();
    }

    evaluateExpression(expression) {
        const tokens = this.tokenize(expression);
        const rpn = this.shuntingYard(tokens);
        return this.evaluateRPN(rpn);
    }

    tokenize(expression) {
        // Improved tokenizer to handle multi-digit numbers, decimals, and negative numbers.
        const pattern = /(\d+\.?\d*)|([+\-*/÷()])|(-(?=\d|\.|\())/g; // handles numbers, operators, parentheses, and unary minus at start of number
        let tokens = [];
        let match;
        while ((match = pattern.exec(expression)) !== null) {
            tokens.push(match[0]);
        }
        // Refined unary minus handling: mark '-' as 'u-' if it's unary
        for (let i = 0; i < tokens.length; i++) {
            if (tokens[i] === '-') {
                if (i === 0 || ['(', '+', '-', '*', '÷'].includes(tokens[i - 1])) {
                    tokens[i] = 'u-'; // Mark as unary minus
                }
            }
        }
        return tokens.filter(t => t.trim() !== '');
    }

    getPrecedence(op) {
        if (op === 'u-') return 3; // Unary minus
        if (op === '*' || op === '÷') return 2;
        if (op === '+' || op === '-') return 1;
        return 0;
    }

    shuntingYard(tokens) {
        const outputQueue = [];
        const operatorStack = [];
        const precedence = {'+': 1, '-': 1, '*': 2, '÷': 2, 'u-': 3};
        const associativity = {'+': 'L', '-': 'L', '*': 'L', '÷': 'L', 'u-': 'R'}; // Unary is Right-associative

        tokens.forEach(token => {
            if (!isNaN(parseFloat(token))) { // Number
                outputQueue.push(parseFloat(token));
            } else if (token === 'u-') { // Handle unary minus
                operatorStack.push(token);
            } else if (token in precedence) { // Operator
                while (operatorStack.length > 0 &&
                       operatorStack[operatorStack.length - 1] !== '(' &&
                       (precedence[operatorStack[operatorStack.length - 1]] > precedence[token] ||
                       (precedence[operatorStack[operatorStack.length - 1]] === precedence[token] && associativity[token] === 'L'))) {
                    outputQueue.push(operatorStack.pop());
                }
                operatorStack.push(token);
            } else if (token === '(') {
                operatorStack.push(token);
            } else if (token === ')') {
                while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
                    outputQueue.push(operatorStack.pop());
                }
                if (operatorStack.length === 0) throw new Error("Mismatched parentheses )");
                operatorStack.pop(); // Pop '('
            }
        });

        while (operatorStack.length > 0) {
            if (operatorStack[operatorStack.length - 1] === '(') throw new Error("Mismatched parentheses (");
            outputQueue.push(operatorStack.pop());
        }
        return outputQueue;
    }

    evaluateRPN(rpnTokens) {
        const stack = [];
        rpnTokens.forEach(token => {
            if (typeof token === 'number') {
                stack.push(token);
            } else if (token === 'u-') { // Handle unary minus
                if (stack.length < 1) throw new Error("Invalid RPN for unary minus");
                stack.push(-stack.pop());
            } else { // Binary operator
                if (stack.length < 2) throw new Error("Invalid RPN expression");
                const b = stack.pop();
                const a = stack.pop();
                switch (token) {
                    case '+': stack.push(a + b); break;
                    case '-': stack.push(a - b); break;
                    case '*': stack.push(a * b); break;
                    case '÷':
                        if (b === 0) throw new Error("Division by zero");
                        stack.push(a / b);
                        break;
                }
            }
        });
        if (stack.length !== 1) throw new Error("Invalid final RPN stack");
        return stack[0];
    }


    getDisplayNumber(numberStr) { // For formatting results/history
        if (numberStr === null || numberStr === undefined || numberStr === "Error") return numberStr;
        const parts = numberStr.toString().split('.');
        try { // Add try-catch for toLocaleString if parts[0] is not a valid number string
            parts[0] = parseFloat(parts[0]).toLocaleString('en-US', {maximumFractionDigits: 0});
        } catch (e) {
            // If toLocaleString fails, just use the original string part
        }
        return parts.join('.');
    }
    
    formatExpressionForDisplay(expression) {
        // Add spaces around operators for better readability in history/calculation line
        return expression
            .replace(/u-/g, '-') // Display unary minus as just minus
            .replace(/([+\-*/÷()])/g, ' $1 ') // Add spaces around all operators and parentheses
            .replace(/\s\s+/g, ' ') // Replace multiple spaces with single
            .trim();
    }
    
    stripSpacesFromExpressionForInternal(displayExpression) {
        // Removes spaces that were added for display
        // The tokenizer will handle re-identifying unary minus from the raw string.
        return displayExpression.replace(/\s/g, '');
    }


    updateDisplay() {
        this.currentOperandTextElement.innerText = this.formatExpressionForDisplay(this.currentExpression);
        this.calculationLineElement.innerText = this.lastComputedFullExpression;
    }

    saveHistory() {
        localStorage.setItem('calculatorHistoryV3', JSON.stringify(this.history));
    }

    renderHistory() {
        this.historyListElement.innerHTML = '';
        this.history.forEach(entryText => {
            const li = document.createElement('li');
            li.textContent = entryText;

            li.addEventListener('click', () => {
                if (entryText.startsWith("Error") || entryText.startsWith("Failed:")) { // Don't load error states
                    this.clear();
                    return;
                }

                const expressionPartWithSpaces = entryText.substring(0, entryText.lastIndexOf(" ="));
                // Load the raw expression, tokenizer will handle unary minus etc.
                this.currentExpression = this.stripSpacesFromExpressionForInternal(expressionPartWithSpaces);
                
                this.justComputed = false;
                this.lastComputedFullExpression = ''; // Clear the "expr =" line

                // Recalculate openParenthesesCount for the loaded expression
                this.openParenthesesCount = 0;
                for (const char of this.currentExpression) { // Use the raw expression
                    if (char === '(') this.openParenthesesCount++;
                    else if (char === ')') this.openParenthesesCount--;
                }

                this.updateDisplay();

                // Optional: Hide history panel
                if (historyPanelWrapper.classList.contains('visible')) {
                     historyPanelWrapper.classList.remove('visible');
                }
            });
            this.historyListElement.appendChild(li);
        });
    }
}

// DOM Elements
const currentOperandTextElement = document.querySelector('[data-current-operand]');
const calculationLineElement = document.querySelector('[data-calculation-line]');
const historyListElement = document.getElementById('history-list');
const historyPanelWrapper = document.getElementById('history-panel-wrapper');
const historyToggleButton = document.getElementById('history-toggle');
const clearHistoryButton = document.getElementById('clear-history-button'); // Get the new button

const numberButtons = document.querySelectorAll('[data-number]');
const operationButtons = document.querySelectorAll('[data-operation]');
const parenthesisButtons = document.querySelectorAll('[data-parenthesis]');
const equalsButton = document.querySelector('[data-equals]');
const deleteButton = document.querySelector('[data-delete]');
const allClearButton = document.querySelector('[data-all-clear]');

const themeToggleButton = document.getElementById('theme-toggle');
const body = document.body;
const sunIcon = themeToggleButton.querySelector('.feather-sun');
const moonIcon = themeToggleButton.querySelector('.feather-moon');

const calculator = new Calculator(currentOperandTextElement, calculationLineElement, historyListElement);

numberButtons.forEach(button => button.addEventListener('click', () => calculator.appendToken(button.innerText)));
operationButtons.forEach(button => button.addEventListener('click', () => calculator.appendToken(button.dataset.operation)));
parenthesisButtons.forEach(button => button.addEventListener('click', () => calculator.appendToken(button.dataset.parenthesis)));
equalsButton.addEventListener('click', () => calculator.compute());
allClearButton.addEventListener('click', () => calculator.clear());
deleteButton.addEventListener('click', () => calculator.delete());

// Event listener for the new Clear History button
clearHistoryButton.addEventListener('click', () => {
    // Optional: Add a confirmation dialog here if desired
    // if (confirm("Are you sure you want to clear all history?")) {
    //     calculator.clearHistory();
    // }
    calculator.clearHistory(); // Clears without confirmation for now
});

function toggleTheme() {
    body.classList.toggle('dark-mode');
    body.classList.toggle('light-mode');
    const isDarkMode = body.classList.contains('dark-mode');
    sunIcon.style.display = isDarkMode ? 'none' : 'block';
    moonIcon.style.display = isDarkMode ? 'block' : 'none';
    localStorage.setItem('theme', isDarkMode ? 'dark-mode' : 'light-mode');
}
themeToggleButton.addEventListener('click', toggleTheme);

historyToggleButton.addEventListener('click', () => {
    historyPanelWrapper.classList.toggle('visible');
});

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'dark-mode'; // Default to dark
    if (savedTheme === 'dark-mode') {
        body.classList.remove('light-mode'); body.classList.add('dark-mode');
        sunIcon.style.display = 'none'; moonIcon.style.display = 'block';
    } else {
        body.classList.remove('dark-mode'); body.classList.add('light-mode');
        sunIcon.style.display = 'block'; moonIcon.style.display = 'none';
    }
    calculator.updateDisplay();
});
