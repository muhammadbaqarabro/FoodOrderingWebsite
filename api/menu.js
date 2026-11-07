module.exports = (req, res) => {
    // Aapka backend logic ya data yahan aayega
    res.status(200).json({ 
        message: "Menu loaded successfully", 
        data: [] // Ya yahan apna menu items ka array likh sakte hain
    });
};