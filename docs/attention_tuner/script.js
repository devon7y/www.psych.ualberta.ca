document.addEventListener('DOMContentLoaded', () => {
    const startScreen = document.getElementById('start-screen');
    const pureStrongBtn = document.getElementById('pure-strong-btn');
    const pureWeakBtn = document.getElementById('pure-weak-btn');
    const mixedBtn = document.getElementById('mixed-btn');
    const studyPhase = document.getElementById('study-phase');
    const distractorPhase = document.getElementById('distractor-phase');
    const recognitionPhase = document.getElementById('recognition-phase');
    const resultsPhase = document.getElementById('results-phase');
    const wordDisplay = document.getElementById('word-display');
    const distractorProblem = document.getElementById('distractor-problem');
    const distractorAnswer = document.getElementById('distractor-answer');
    const timerDisplay = document.getElementById('timer');
    const recognitionWord = document.getElementById('recognition-word');
    const attentionSpotlight = document.getElementById('attention-spotlight');
    const yesButton = document.getElementById('yes-button');
    const noButton = document.getElementById('no-button');
    const resultsSummary = document.getElementById('results-summary');
    const resultsChart = document.getElementById('results-chart');
    const resultsExplanation = document.getElementById('results-explanation');

    // Word lists
    const words = [
        'apple', 'banana', 'carrot', 'dog', 'elephant',
        'flower', 'guitar', 'house', 'ice cream', 'jungle',
        'kangaroo', 'lemon', 'mountain', 'notebook', 'ocean',
        'pencil', 'queen', 'river', 'sun', 'tree',
        'umbrella', 'violin', 'water', 'xylophone', 'yacht', 'zebra'
    ];

    // Game state
    let currentPhase = 'start';
    let listType = ''; // 'pure-strong', 'pure-weak', or 'mixed'
    let studyList = [];
    let recognitionList = [];
    let userResponses = [];

    // --- Event Listeners ---
    pureStrongBtn.addEventListener('click', () => startGame('pure-strong'));
    pureWeakBtn.addEventListener('click', () => startGame('pure-weak'));
    mixedBtn.addEventListener('click', () => startGame('mixed'));

    // --- Game Logic ---

    function startGame(selectedListType) {
        listType = selectedListType;
        startScreen.style.display = 'none';
        studyPhase.style.display = 'block';
        currentPhase = 'study';
        generateStudyList();
        startStudyPhase();
    }

    function generateStudyList() {
        let wordCopy = [...words];
        studyList = [];
        let strongCount = 0;
        let weakCount = 0;

        if (listType === 'pure-strong') {
            strongCount = 10;
        } else if (listType === 'pure-weak') {
            weakCount = 10;
        } else { // mixed
            strongCount = 5;
            weakCount = 5;
        }

        for (let i = 0; i < strongCount; i++) {
            const randomIndex = Math.floor(Math.random() * wordCopy.length);
            studyList.push({ word: wordCopy.splice(randomIndex, 1)[0], strength: 'strong' });
        }

        for (let i = 0; i < weakCount; i++) {
            const randomIndex = Math.floor(Math.random() * wordCopy.length);
            studyList.push({ word: wordCopy.splice(randomIndex, 1)[0], strength: 'weak' });
        }

        // Shuffle the list
        studyList = studyList.sort(() => Math.random() - 0.5);
    }

    function startStudyPhase() {
        let wordIndex = 0;

        function showNextWord() {
            if (wordIndex < studyList.length) {
                const item = studyList[wordIndex];
                wordDisplay.textContent = item.word;
                wordDisplay.className = item.strength === 'strong' ? 'strong-word' : 'weak-word';
                const duration = item.strength === 'strong' ? 2000 : 500;
                wordIndex++;
                setTimeout(showNextWord, duration + 500); // word duration + 500ms pause
            } else {
                // End of study phase
                studyPhase.style.display = 'none';
                distractorPhase.style.display = 'block';
                currentPhase = 'distractor';
                startDistractorPhase();
            }
        }

        showNextWord();
    }

    function startDistractorPhase() {
        const num1 = Math.floor(Math.random() * 10) + 1;
        const num2 = Math.floor(Math.random() * 10) + 1;
        const num3 = Math.floor(Math.random() * 10) + 1;
        const problem = `${num1} + ${num2} + ${num3} = ?`;
        const correctAnswer = num1 + num2 + num3;

        distractorProblem.textContent = problem;

        let timeLeft = 10;
        timerDisplay.textContent = timeLeft;
        const timer = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(timer);
                checkDistractorAnswer(correctAnswer);
            }
        }, 1000);

        submitAnswer.onclick = () => {
            clearInterval(timer);
            checkDistractorAnswer(correctAnswer);
        };
    }

    function checkDistractorAnswer(correctAnswer) {
        const userAnswer = parseInt(distractorAnswer.value, 10);
        distractorPhase.style.display = 'none';
        recognitionPhase.style.display = 'block';
        currentPhase = 'recognition';
        startRecognitionPhase();
    }

    function startRecognitionPhase() {
        generateRecognitionList();
        let wordIndex = 0;

        // Set up attention spotlight
        if (listType === 'pure-strong') {
            attentionSpotlight.style.width = '150px';
            attentionSpotlight.style.height = '150px';
        } else { // pure-weak or mixed
            attentionSpotlight.style.width = '300px';
            attentionSpotlight.style.height = '300px';
        }
        attentionSpotlight.style.display = 'block';

        function showNextRecognitionWord() {
            if (wordIndex < recognitionList.length) {
                recognitionWord.textContent = recognitionList[wordIndex].word;
            } else {
                // End of recognition phase
                recognitionPhase.style.display = 'none';
                resultsPhase.style.display = 'block';
                currentPhase = 'results';
                showResults();
            }
        }

        yesButton.onclick = () => {
            recordResponse(true, wordIndex);
            wordIndex++;
            showNextRecognitionWord();
        };

        noButton.onclick = () => {
            recordResponse(false, wordIndex);
            wordIndex++;
            showNextRecognitionWord();
        };

        showNextRecognitionWord();
    }

    function generateRecognitionList() {
        recognitionList = [...studyList];
        const lureCount = 10;
        let wordCopy = [...words];

        // Filter out studied words from the lure pool
        const studiedWords = studyList.map(item => item.word);
        wordCopy = wordCopy.filter(word => !studiedWords.includes(word));

        for (let i = 0; i < lureCount; i++) {
            const randomIndex = Math.floor(Math.random() * wordCopy.length);
            recognitionList.push({ word: wordCopy.splice(randomIndex, 1)[0], strength: 'lure' });
        }

        // Shuffle the list
        recognitionList = recognitionList.sort(() => Math.random() - 0.5);
    }

    function recordResponse(response, index) {
        const item = recognitionList[index];
        userResponses.push({
            word: item.word,
            strength: item.strength,
            response: response,
            correct: (item.strength !== 'lure' && response === true) || (item.strength === 'lure' && response === false)
        });
    }

    function showResults() {
        // Calculate performance metrics
        const strong_pure_correct = userResponses.filter(r => r.strength === 'strong' && listType === 'pure-strong' && r.correct).length;
        const strong_mixed_correct = userResponses.filter(r => r.strength === 'strong' && listType === 'mixed' && r.correct).length;
        const weak_mixed_correct = userResponses.filter(r => r.strength === 'weak' && listType === 'mixed' && r.correct).length;
        const weak_pure_correct = userResponses.filter(r => r.strength === 'weak' && listType === 'pure-weak' && r.correct).length;

        const total_strong_pure = userResponses.filter(r => r.strength === 'strong' && listType === 'pure-strong').length;
        const total_strong_mixed = userResponses.filter(r => r.strength === 'strong' && listType === 'mixed').length;
        const total_weak_mixed = userResponses.filter(r => r.strength === 'weak' && listType === 'mixed').length;
        const total_weak_pure = userResponses.filter(r => r.strength === 'weak' && listType === 'pure-weak').length;

        const strong_pure_accuracy = total_strong_pure > 0 ? (strong_pure_correct / total_strong_pure) * 100 : 0;
        const strong_mixed_accuracy = total_strong_mixed > 0 ? (strong_mixed_correct / total_strong_mixed) * 100 : 0;
        const weak_mixed_accuracy = total_weak_mixed > 0 ? (weak_mixed_correct / total_weak_mixed) * 100 : 0;
        const weak_pure_accuracy = total_weak_pure > 0 ? (weak_pure_correct / total_weak_pure) * 100 : 0;

        resultsSummary.innerHTML = `
            <p><b>Overall Accuracy:</b> ${((strong_pure_correct + strong_mixed_correct + weak_mixed_correct + weak_pure_correct) / (total_strong_pure + total_strong_mixed + total_weak_mixed + total_weak_pure) * 100).toFixed(2)}%</p>
            <p><b>Strong Word Accuracy (Pure List):</b> ${strong_pure_accuracy.toFixed(2)}%</p>
            <p><b>Strong Word Accuracy (Mixed List):</b> ${strong_mixed_accuracy.toFixed(2)}%</p>
            <p><b>Weak Word Accuracy (Mixed List):</b> ${weak_mixed_accuracy.toFixed(2)}%</p>
            <p><b>Weak Word Accuracy (Pure List):</b> ${weak_pure_accuracy.toFixed(2)}%</p>
        `;

        // Draw chart
        google.charts.load('current', {packages:['corechart']});
        google.charts.setOnLoadCallback(drawChart);

        function drawChart() {
            const data = google.visualization.arrayToDataTable([
                ['Condition', 'Strong Words', 'Weak Words'],
                ['Pure List', strong_pure_accuracy, weak_pure_accuracy],
                ['Mixed List', strong_mixed_accuracy, weak_mixed_accuracy]
            ]);

            const options = {
                title: 'Inverted List-Strength Effect',
                vAxis: { title: 'Accuracy (%)' },
                hAxis: { title: 'List Type' },
                seriesType: 'bars',
                legend: { position: 'bottom' }
            };

            const chart = new google.visualization.ComboChart(resultsChart);
            chart.draw(data, options);
        }

        resultsExplanation.textContent = 'Notice anything strange? You were likely more accurate at recognizing \'strong\' words when they were in a list with other strong words (pure list) than when they were mixed with weak words. This is the inverted list-strength effect! It happens because when your brain expects only deep, meaningful information, it narrows its focus. When it expects a mix of shallow and deep information, it widens its focus, making it harder to pinpoint the specific deep features of the strong words.';
    }

    // --- Init ---
    // The game now starts on button click
});
